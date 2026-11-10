//! Lecture d'une sauvegarde FM27 (.fm) : frames zstd concaténées, puis fiches joueurs et clubs.
//! Format déduit par rétro-ingénierie (les octets bruts sont interprétés côté TypeScript, src/domain/fmSave.ts).

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];
/// Date vide de FM : jour 1 de 1900 (`01 00 6C 07`).
const EMPTY_DATE: [u8; 4] = [1, 0, 0x6c, 0x07];
const NONE: u32 = 0xffff_ffff;
/// Valeur de 300 M£ : plafond donné à des milliers de joueurs sans valeur calculée (vétérans de petits championnats…).
const VALUE_PLACEHOLDER: u32 = 300_000_000;

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameDate {
  /// Jour de l'année (1 = 1er janvier).
  pub day: u16,
  pub year: u16,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveClub {
  pub id: u32,
  pub name: String,
  pub short_name: String,
  pub nation: u32,
  /// Joueurs de l'équipe première.
  pub players: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveSummary {
  pub manager: String,
  /// Club géré par le joueur humain (null si introuvable).
  pub managed_club_id: Option<u32>,
  pub game_date: Option<GameDate>,
  pub clubs: Vec<SaveClub>,
  pub total_players: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavePlayer {
  pub name: String,
  pub first_name: String,
  pub last_name: String,
  pub birth: GameDate,
  pub nation: u32,
  /// Familiarité aux 15 postes (1-20) : GK, SW, DL, DC, DR, DM, ML, MC, MR, AML, AMC, AMR, ST, WBL, WBR.
  pub positions: Vec<u8>,
  /// 54 valeurs 1-100 : 47 attributs, les deux pieds et 5 valeurs cachées.
  pub values: Vec<u8>,
  pub contract_end: Option<GameDate>,
  /// Salaire hebdomadaire en livres sterling (unité interne de FM), 0 si inconnu.
  pub wage: u32,
  /// Valeur de transfert en livres sterling, None si inconnue.
  pub value: Option<u32>,
  /// Note moyenne en match de la saison (toutes compétitions officielles), None sans match noté.
  pub avg_rating: Option<f32>,
  /// Matchs notés de la saison.
  pub rated_matches: u32,
  /// Prêté par ce club à un autre (club d'accueil dans `host_club`).
  pub on_loan: bool,
  pub host_club: String,
}

/// Fiche joueur repérée dans la sauvegarde décompressée.
struct RawPlayer {
  /// Identifiant interne de la personne (u32 à bloc−43, suivi de l'UID FM deux fois).
  id: u32,
  block: usize,
  marker: usize,
  name: String,
  first_name: String,
  last_name: String,
  birth: GameDate,
  nation: u32,
  positions: Vec<u8>,
  values: Vec<u8>,
  /// Valeur de transfert en livres (u32 juste après les 54 valeurs), None si inconnue.
  value: Option<u32>,
  team: u32,
  /// Équipes des contrats, dans l'ordre (le premier est avec le club propriétaire).
  contracts: Vec<Contract>,
}

/// Contrat d'un joueur avec une équipe.
struct Contract {
  team: u32,
  end: Option<GameDate>,
  /// Salaire hebdomadaire en livres sterling.
  wage: u32,
}

struct RawClub {
  id: u32,
  name: String,
  short_name: String,
  nation: u32,
  /// Équipes du club : la première est l'équipe A, les suivantes les équipes de jeunes.
  teams: Vec<u32>,
}

/// Joueur d'une équipe de jeunes ou affiliée du club.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct YouthPlayer {
  /// 0 = équipe de jeunes du club (U19…), 1 = équipe affiliée (B, C…).
  pub kind: u8,
  /// Rang de l'équipe dans sa nature (0 = la première).
  pub rank: u8,
  #[serde(flatten)]
  pub player: SavePlayer,
}

pub struct ParsedSave {
  players: Vec<RawPlayer>,
  /// Stats de la saison par identifiant interne (voir `season_stats`).
  stats: HashMap<u32, SeasonStats>,
  clubs: Vec<RawClub>,
  manager: String,
  managed_club_id: Option<u32>,
  game_date: Option<GameDate>,
}

/// Dernière sauvegarde lue (chemin, résultat) : la lecture prend plusieurs secondes.
static CACHE: Mutex<Option<(String, Arc<ParsedSave>)>> = Mutex::new(None);

fn u16_at(d: &[u8], p: usize) -> u16 {
  u16::from_le_bytes([d[p], d[p + 1]])
}

fn u32_at(d: &[u8], p: usize) -> u32 {
  u32::from_le_bytes([d[p], d[p + 1], d[p + 2], d[p + 3]])
}

/// Les 9 bits de poids faible portent le jour ; certains champs y ajoutent des drapeaux.
fn date_at(d: &[u8], p: usize) -> GameDate {
  GameDate { day: u16_at(d, p) & 0x1ff, year: u16_at(d, p + 2) }
}

/// Décompresse toutes les frames zstd du fichier et les concatène.
pub fn decompress(file: &[u8]) -> Result<Vec<u8>, String> {
  // une sauvegarde se décompresse en environ 4 fois sa taille
  let mut out = Vec::with_capacity(file.len() * 9 / 2);
  let mut pos = find(file, &ZSTD_MAGIC, 0).ok_or("aucune donnée compressée : ce n'est pas une sauvegarde FM")?;
  while pos < file.len() {
    if file[pos..].starts_with(&ZSTD_MAGIC) {
      if let Ok(size) = zstd::zstd_safe::find_frame_compressed_size(&file[pos..]) {
        if let Ok(part) = zstd::stream::decode_all(&file[pos..pos + size]) {
          out.extend_from_slice(&part);
          pos += size;
          continue;
        }
      }
    }
    match find(file, &ZSTD_MAGIC, pos + 1) {
      Some(next) => pos = next,
      None => break,
    }
  }
  if out.is_empty() {
    return Err("sauvegarde illisible (décompression)".into());
  }
  Ok(out)
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
  if from >= hay.len() {
    return None;
  }
  hay[from..].windows(needle.len()).position(|w| w == needle).map(|i| i + from)
}

/// Tables de noms : suites `[id u32][longueur u32][texte]` à id consécutifs depuis 0.
/// Dans l'ordre du fichier : prénoms, noms, noms d'usage.
fn name_tables(d: &[u8]) -> Vec<Vec<String>> {
  let entry = |p: usize| -> Option<(u32, usize, usize)> {
    if p + 8 > d.len() {
      return None;
    }
    let len = u32_at(d, p + 4) as usize;
    if len == 0 || len > 120 || p + 8 + len > d.len() {
      return None;
    }
    Some((u32_at(d, p), p + 8, len))
  };
  let mut tables = Vec::new();
  let mut p = 0;
  while p + 16 < d.len() && tables.len() < 3 {
    if u32_at(d, p) != 0 {
      p += 1;
      continue;
    }
    let Some((_, start, len)) = entry(p) else {
      p += 1;
      continue;
    };
    let mut names = vec![String::from_utf8_lossy(&d[start..start + len]).into_owned()];
    let mut q = start + len;
    while let Some((id, s, l)) = entry(q) {
      if id as usize != names.len() {
        break;
      }
      names.push(String::from_utf8_lossy(&d[s..s + l]).into_owned());
      q = s + l;
    }
    if names.len() >= 1000 {
      tables.push(names);
      p = q;
    } else {
      p += 1;
    }
  }
  tables
}

/// Bloc joueur : 15 octets de postes (1-20), 54 valeurs (1-100), puis la valeur de transfert (u32, £) + 1 octet,
/// une date et une date vide.
fn is_block(d: &[u8], p: usize) -> bool {
  if p + 82 > d.len() || d[p + 81] != 0x07 || d[p + 78..p + 82] != EMPTY_DATE {
    return false;
  }
  d[p..p + 15].iter().all(|&v| (1..=20).contains(&v)) && d[p + 15..p + 69].iter().all(|&v| (1..=100).contains(&v))
}

/// Distance entre la fin d'un bloc et le repère de sa fiche : en général 1 à 3 Ko (`MARKER_NEAR`), mais plus
/// de 4 Ko pour certains joueurs (Yangel Herrera : 4,2 Ko), cherchés alors jusqu'à `MARKER_FAR`.
const MARKER_NEAR: usize = 4_000;
const MARKER_FAR: usize = 16_000;

fn is_marker(d: &[u8], q: usize) -> bool {
  d[q] == 0 && d[q + 1] == 0 && d[q + 2] == 0 && d[q + 3] == 3 && d[q + 4] == 1 && d[q + 6..q + 13].iter().all(|&v| v == 0)
}

/// Repère qui suit le nom et la date de naissance : `00 00 00 03 01 <nation> 00×7`, avec sa fiche d'identité
/// (position du nom légal, voir `legal_name`).
/// Le même motif apparaît parfois ailleurs (Kubo : faux repère à 1,2 Ko, vrai à 6,1 Ko) : un repère sans nom légal
/// devant est ignoré. Au-delà de `MARKER_NEAR`, ou après un faux repère, la recherche s'arrête au bloc joueur
/// suivant : ce repère serait le sien.
fn next_marker(d: &[u8], from: usize) -> Option<(usize, usize)> {
  let limit = d.len().saturating_sub(16);
  let near = (from + MARKER_NEAR).min(limit);
  let mut rejected = false;
  for q in from..(from + MARKER_FAR).min(limit) {
    if (q >= near || rejected) && is_block(d, q) {
      return None;
    }
    if is_marker(d, q) {
      match legal_name(d, q) {
        Some(lp) => return Some((q, lp)),
        None => rejected = true,
      }
    }
  }
  None
}

/// Position du nom légal avant le repère `m` :
/// `[prénom u32][0][nom u32][0][nom d'usage u32][0][longueur u32][nom légal][jour u16][année u16][5 octets] repère`.
fn legal_name(d: &[u8], m: usize) -> Option<usize> {
  (0..=120usize).map(|k| (k, m.wrapping_sub(13 + k))).find_map(|(k, lp)| {
    (lp >= 16 && lp < d.len() && u32_at(d, lp) as usize == k && d[lp - 1] == 0 && d[lp - 6] == 0 && d[lp - 11] == 0)
      .then_some(lp)
  })
}

/// Contrats : `01 00 6C 07 ?? [u32][équipe u32] 00×4 [salaire u32] 01 0B 00`, fin de contrat 38 octets avant.
fn contracts_between(d: &[u8], from: usize, to: usize) -> Vec<Contract> {
  let mut out = Vec::new();
  let to = to.min(d.len().saturating_sub(24));
  for q in from.max(40)..to {
    if d[q..q + 4] == EMPTY_DATE
      && d[q + 13..q + 17] == [0, 0, 0, 0]
      && d[q + 21..q + 24] == [1, 11, 0]
    {
      let end = date_at(d, q - 38);
      let end = (end.year > 1900 && end.day >= 1 && end.day <= 366).then_some(end);
      out.push(Contract { team: u32_at(d, q + 9), end, wage: u32_at(d, q + 17) });
    }
  }
  out
}

fn parse_players(d: &[u8], names: &[Vec<String>]) -> Vec<RawPlayer> {
  let name_of = |t: usize, id: u32| names.get(t).and_then(|n| n.get(id as usize)).cloned();
  let mut found = Vec::new();
  let mut p = 8;
  while p + 100 < d.len() {
    if !is_block(d, p) {
      p += 1;
      continue;
    }
    let Some((m, lp)) = next_marker(d, p + 69) else {
      p += 1;
      continue;
    };
    {
      let first = name_of(0, u32_at(d, lp - 15)).unwrap_or_default();
      let last = name_of(1, u32_at(d, lp - 10)).unwrap_or_default();
      let common = u32_at(d, lp - 5);
      let name = match (common != NONE).then(|| name_of(2, common)).flatten() {
        Some(n) => n,
        None => format!("{first} {last}").trim().to_string(),
      };
      found.push(RawPlayer {
        id: if p >= 43 { u32_at(d, p - 43) } else { NONE },
        block: p,
        marker: m,
        name,
        first_name: first,
        last_name: last,
        birth: date_at(d, m - 9),
        nation: u32::from(d[m + 5]),
        positions: d[p..p + 15].to_vec(),
        values: d[p + 15..p + 69].to_vec(),
        value: Some(u32_at(d, p + 69)).filter(|&v| v != NONE && v != VALUE_PLACEHOLDER),
        team: u32_at(d, p - 8),
        contracts: Vec::new(),
      });
    }
    p += 69;
  }
  // contrats : entre le bloc et la fiche suivante
  for i in 0..found.len() {
    let from = found[i].block + 69;
    let to = found.get(i + 1).map_or(found[i].marker + 4000, |n| n.block);
    found[i].contracts = contracts_between(d, from, to);
  }
  found
}

/// Bloc des 16 dernières notes d'une fiche de stats : `10`, 16 emplacements de 3 octets (vides `00 00 00` en tête,
/// puis `[note×10][compétition][saison]`, saison 06 en 2026, 07 en 2027…), `01`, puis l'identifiant de la fiche suivante.
fn is_rating_block(d: &[u8], t: usize) -> bool {
  if t + 54 > d.len() || d[t] != 0x10 || d[t + 49] != 1 {
    return false;
  }
  let mut started = false;
  for s in 0..16 {
    let a = t + 1 + s * 3;
    if d[a] == 0 && d[a + 1] == 0 && d[a + 2] == 0 {
      if started {
        return false;
      }
      continue;
    }
    if !(4..=12).contains(&d[a + 2]) || !(10..=100).contains(&d[a]) {
      return false;
    }
    started = true;
  }
  true
}

/// Résumé de la saison juste avant un bloc de notes : entrées de 8 octets
/// `02 [somme des notes×10 u16] [?] [matchs] [?] [?] [matchs]`, une par compétition. Renvoie (somme, matchs).
fn season_summary(d: &[u8], t: usize) -> (u32, u32) {
  let (mut sum, mut apps) = (0u32, 0u32);
  let mut q = t;
  while q >= 8 && d[q - 8] == 2 {
    let s = u32::from(u16_at(d, q - 7));
    let n = u32::from(d[q - 4]);
    if n == 0 || n > 80 || s < n * 10 || s > n * 100 {
      break;
    }
    sum += s;
    apps += n;
    q -= 8;
  }
  (sum, apps)
}

/// Stats de la saison en cours, toutes compétitions (emplacement « total » d'une fiche de stats).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SeasonStats {
  /// Somme des notes×10 et matchs notés.
  pub rating_sum: u32,
  pub rated: u32,
  pub minutes: u16,
  pub starts: u8,
  pub subs: u8,
  pub goals: u8,
  pub assists: u8,
  /// Titres d'homme du match.
  pub pom: u8,
  pub passes: u16,
  pub passes_done: u16,
  pub tackles: u16,
  pub tackles_won: u16,
  pub dribbles: u16,
  pub shots: u16,
  pub shots_on_target: u16,
  /// Buts et passes décisives attendus ×100.
  pub xg: u16,
  pub xa: u16,
  pub fouls: u16,
  pub fouled: u16,
  /// Duels aériens disputés et gagnés.
  pub aerials: u16,
  pub aerials_won: u16,
  pub offsides: u16,
  pub crosses: u16,
  pub crosses_done: u16,
  /// Gardiens : arrêts et buts encaissés.
  pub saves: u8,
  pub conceded: u8,
}

/// Emplacement de stats `01 07` puis, après ces deux octets : somme des notes×10 u16, minutes u16, titularisations,
/// entrées, matchs notés, buts, passes D (u8), homme du match (+12), puis des u16 : passes tentées (+25) et réussies (+27),
/// tacles tentés (+29) et gagnés (+31), dribbles (+37), tirs (+43) et cadrés (+45), xG×100 (+89), xA×100 (+91).
/// Établi sur 21 joueurs d'une capture du jeu ; Σ xG = Σ buts à 0,3 % près sur toute la base.
///
/// Sans capture de référence, par profil par poste et équilibres sur toute la base : fautes commises (+39) et subies (+41)
/// (sommes égales à 0,1 % près), duels aériens disputés (+33) et gagnés (+35) (défenseurs centraux 65 %, attaquants 32 %),
/// hors-jeu (+47, attaquants), centres tentés (+129) et réussis (+131) (ailiers, latéraux), et pour les gardiens (u8)
/// buts encaissés (+9) et arrêts (+61) (Σ arrêts ≈ Σ tirs cadrés − Σ buts).
const SLOT_LEN: usize = 155;

fn read_slot(d: &[u8], s: usize) -> SeasonStats {
  let b = s + 2;
  SeasonStats {
    rating_sum: u32::from(u16_at(d, b)),
    rated: u32::from(d[b + 6]),
    minutes: u16_at(d, b + 2),
    starts: d[b + 4],
    subs: d[b + 5],
    goals: d[b + 7],
    assists: d[b + 8],
    pom: d[b + 12],
    passes: u16_at(d, b + 25),
    passes_done: u16_at(d, b + 27),
    tackles: u16_at(d, b + 29),
    tackles_won: u16_at(d, b + 31),
    dribbles: u16_at(d, b + 37),
    shots: u16_at(d, b + 43),
    shots_on_target: u16_at(d, b + 45),
    xg: u16_at(d, b + 89),
    xa: u16_at(d, b + 91),
    fouls: u16_at(d, b + 39),
    fouled: u16_at(d, b + 41),
    aerials: u16_at(d, b + 33),
    aerials_won: u16_at(d, b + 35),
    offsides: u16_at(d, b + 47),
    crosses: u16_at(d, b + 129),
    crosses_done: u16_at(d, b + 131),
    saves: d[b + 61],
    conceded: d[b + 9],
  }
}

/// Emplacement « total de la saison » d'une fiche (entre `from` et `to`).
///
/// Une fiche aligne des emplacements `01 07` de ~155 octets : un par compétition, puis le total, parfois suivis d'autres
/// (sélection, saison passée…), et parfois glissés entre les compétitions. Le total est le premier emplacement égal
/// (somme des notes, minutes, titularisations, entrées) à la somme de certains des emplacements qui le précèdent ;
/// une fiche à un seul emplacement est son propre total.
fn season_total(d: &[u8], from: usize, to: usize) -> Option<SeasonStats> {
  let mut slots: Vec<usize> = Vec::new();
  let mut j = from;
  while j + 2 + SLOT_LEN <= to.min(d.len()) {
    // les autres `01 07` sont des données : un emplacement fait au moins 150 octets
    if d[j] == 1 && d[j + 1] == 7 && slots.last().map_or(true, |&l| j - l >= 150) {
      slots.push(j);
    }
    j += 1;
  }
  let key = |s: usize| [u32::from(u16_at(d, s + 2)), u32::from(u16_at(d, s + 4)), u32::from(d[s + 6]), u32::from(d[s + 7])];
  // au plus 10 emplacements avant le total (2^10 sommes à essayer)
  for t in 1..slots.len().min(11) {
    let kt = key(slots[t]);
    if kt[1] == 0 {
      continue;
    }
    let keys: Vec<[u32; 4]> = slots[..t].iter().map(|&s| key(s)).collect();
    for mask in 1u32..(1 << t) {
      let mut acc = [0u32; 4];
      for (i, k) in keys.iter().enumerate() {
        if mask & (1 << i) != 0 {
          for (a, v) in acc.iter_mut().zip(k) {
            *a += v;
          }
        }
      }
      if acc == kt {
        return Some(read_slot(d, slots[t]));
      }
    }
  }
  match slots.as_slice() {
    [only] if u16_at(d, only + 4) > 0 => Some(read_slot(d, *only)),
    _ => None,
  }
}

/// Stats de la saison par identifiant interne.
/// Les fiches de stats se suivent par identifiant ; chaque bloc de notes est suivi de `01` et de l'identifiant de la fiche
/// d'après. La fiche du joueur X suit le repère « bloc, 01, X+1 » jusqu'au bloc de notes suivant (établi sur 21 joueurs
/// d'une partie). Sans emplacement total reconnu, seule la note vient du résumé placé avant le bloc suivant.
fn season_stats(d: &[u8]) -> HashMap<u32, SeasonStats> {
  let mut blocks: Vec<(usize, u32)> = Vec::new();
  let mut t = 0;
  while t + 54 <= d.len() {
    if d[t] == 0x10 && d[t + 49] == 1 && is_rating_block(d, t) {
      blocks.push((t, u32_at(d, t + 50)));
      t += 50;
    } else {
      t += 1;
    }
  }
  let mut out: HashMap<u32, SeasonStats> = HashMap::new();
  for w in blocks.windows(2) {
    let ((ta, na), (tb, _)) = (w[0], w[1]);
    // deux fiches voisines (les identifiants ne sont pas toujours croissants : seule la distance compte)
    if tb - ta > 40_000 || na == 0 {
      continue;
    }
    let stats = season_total(d, ta + 54, tb).unwrap_or_else(|| {
      let (rating_sum, rated) = season_summary(d, tb);
      SeasonStats { rating_sum, rated, ..Default::default() }
    });
    let entry = out.entry(na - 1).or_default();
    if entry.rated == 0 && entry.minutes == 0 {
      *entry = stats;
    }
  }
  out
}

/// Fiches club : `[id u32][uid u32][uid u32][0][nation u32][FFFFFFFF][nation][nation][u32][? ? ? 10 ? ?][nom][nom court]`,
/// puis plus loin `00 FF 00 n` suivi des n équipes du club.
fn parse_clubs(d: &[u8]) -> Vec<RawClub> {
  let mut clubs: Vec<(usize, RawClub)> = Vec::new();
  let mut i = 0;
  while i + 64 < d.len() {
    // les octets autour du 0x10 sont des drapeaux (variables) : la nation répétée trois fois rend le motif sûr
    if d[i + 36] != 16
      || u32_at(d, i + 4) != u32_at(d, i + 8)
      || d[i + 12] != 0
      || u32_at(d, i + 17) != NONE
      || u32_at(d, i + 13) != u32_at(d, i + 21)
      || u32_at(d, i + 13) != u32_at(d, i + 25)
    {
      i += 1;
      continue;
    }
    let len = u32_at(d, i + 39) as usize;
    if len == 0 || len > 120 || i + 47 + len > d.len() {
      i += 1;
      continue;
    }
    let len2 = u32_at(d, i + 43 + len) as usize;
    let short = if len2 <= 120 && i + 47 + len + len2 <= d.len() {
      String::from_utf8_lossy(&d[i + 47 + len..i + 47 + len + len2]).into_owned()
    } else {
      String::new()
    };
    let club = RawClub {
      id: u32_at(d, i),
      name: String::from_utf8_lossy(&d[i + 43..i + 43 + len]).into_owned(),
      short_name: short,
      nation: u32_at(d, i + 13),
      teams: Vec::new(),
    };
    clubs.push((i, club));
    i += 43 + len;
  }
  for k in 0..clubs.len() {
    let start = clubs[k].0 + 43;
    let end = clubs.get(k + 1).map_or(start + 20000, |c| c.0).min(start + 20000).min(d.len() - 8);
    for q in start..end {
      if d[q] != 0 || d[q + 1] != 255 || d[q + 2] != 0 {
        continue;
      }
      let n = d[q + 3] as usize;
      if !(1..=12).contains(&n) || q + 4 + n * 4 > d.len() {
        continue;
      }
      let teams: Vec<u32> = (0..n).map(|t| u32_at(d, q + 4 + t * 4)).collect();
      if teams.iter().all(|&t| t < 1_000_000) {
        clubs[k].1.teams = teams;
        break;
      }
    }
  }
  clubs.into_iter().map(|(_, c)| c).collect()
}

/// En-tête : `[longueur][nom du manager][longueur][nom du club][u32][date du jeu]`, dans les premiers Ko.
fn parse_header(d: &[u8], clubs: &[RawClub]) -> (String, Option<u32>, Option<GameDate>) {
  // un même nom peut revenir dans d'autres fiches : on garde le premier club qui a des équipes
  let mut names: HashMap<&str, u32> = HashMap::new();
  for c in clubs.iter().filter(|c| !c.teams.is_empty()) {
    // l'en-tête donne parfois le nom complet, parfois le nom court
    names.entry(c.name.as_str()).or_insert(c.id);
    names.entry(c.short_name.as_str()).or_insert(c.id);
  }
  let limit = d.len().min(200_000);
  let text = |p: usize| -> Option<(String, usize)> {
    if p + 4 > limit {
      return None;
    }
    let len = u32_at(d, p) as usize;
    if !(2..=80).contains(&len) || p + 4 + len > limit {
      return None;
    }
    let s = std::str::from_utf8(&d[p + 4..p + 4 + len]).ok()?;
    s.chars().all(|c| !c.is_control()).then(|| (s.to_string(), p + 4 + len))
  };
  for p in 0..limit {
    let Some((manager, after)) = text(p) else { continue };
    let Some((club, end)) = text(after) else { continue };
    let Some(&id) = names.get(club.as_str()) else { continue };
    if end + 8 > limit {
      continue;
    }
    let date = date_at(d, end + 4);
    let date = (date.year >= 2000 && date.year < 2200 && date.day >= 1).then_some(date);
    return (manager, Some(id), date);
  }
  (String::new(), None, None)
}

pub fn parse(file: &[u8]) -> Result<ParsedSave, String> {
  let d = decompress(file)?;
  let names = name_tables(&d);
  if names.len() < 3 {
    return Err("tables de noms introuvables dans la sauvegarde".into());
  }
  let players = parse_players(&d, &names);
  let clubs = parse_clubs(&d);
  let (manager, managed_club_id, game_date) = parse_header(&d, &clubs);
  let stats = season_stats(&d);
  Ok(ParsedSave { players, stats, clubs, manager, managed_club_id, game_date })
}

impl ParsedSave {
  /// Note moyenne de la saison (somme÷matchs, notes au dixième) et nombre de matchs notés.
  fn season_rating(&self, p: &RawPlayer) -> (Option<f32>, u32) {
    match self.stats.get(&p.id) {
      Some(s) if s.rated > 0 => (Some(s.rating_sum as f32 / s.rated as f32 / 10.0), s.rated),
      _ => (None, 0),
    }
  }

  fn team_owner(&self) -> HashMap<u32, usize> {
    let mut owner = HashMap::new();
    for (i, c) in self.clubs.iter().enumerate() {
      for &t in &c.teams {
        owner.entry(t).or_insert(i);
      }
    }
    owner
  }

  pub fn summary(&self) -> SaveSummary {
    let mut counts: HashMap<u32, u32> = HashMap::new();
    for p in &self.players {
      *counts.entry(p.team).or_default() += 1;
    }
    let mut clubs: Vec<SaveClub> = self
      .clubs
      .iter()
      .filter_map(|c| {
        let players = *counts.get(c.teams.first()?)?;
        Some(SaveClub { id: c.id, name: c.name.clone(), short_name: c.short_name.clone(), nation: c.nation, players })
      })
      .collect();
    clubs.sort_by(|a, b| a.short_name.to_lowercase().cmp(&b.short_name.to_lowercase()));
    SaveSummary {
      manager: self.manager.clone(),
      managed_club_id: self.managed_club_id,
      game_date: self.game_date,
      clubs,
      total_players: self.players.len() as u32,
    }
  }

  /// Équipe première du club, plus les joueurs qu'il a prêtés.
  pub fn club_players(&self, club_id: u32) -> Result<Vec<SavePlayer>, String> {
    let club = self.clubs.iter().find(|c| c.id == club_id).ok_or("club introuvable")?;
    let first = *club.teams.first().ok_or("ce club n'a pas d'équipe")?;
    let owner = self.team_owner();
    let host_name = |team: u32| owner.get(&team).map(|&i| self.clubs[i].short_name.clone()).unwrap_or_default();
    let mut out = Vec::new();
    for p in &self.players {
      // contrat le plus précis (le dernier) : un joueur de l'équipe B a aussi un contrat avec le club
      let last_contract = p.contracts.last().map(|c| c.team);
      let in_squad = p.team == first;
      let loaned_out =
        !in_squad && p.team != NONE && last_contract == Some(first) && !club.teams.contains(&p.team);
      if !in_squad && !loaned_out {
        continue;
      }
      let host = if loaned_out { host_name(p.team) } else { String::new() };
      out.push(self.save_player(p, first, loaned_out, host));
    }
    Ok(out)
  }

  fn save_player(&self, p: &RawPlayer, contract_team: u32, on_loan: bool, host_club: String) -> SavePlayer {
    let contract = p.contracts.iter().find(|c| c.team == contract_team).or(p.contracts.first());
    let (avg_rating, rated_matches) = self.season_rating(p);
    SavePlayer {
      name: p.name.clone(),
      first_name: p.first_name.clone(),
      last_name: p.last_name.clone(),
      birth: p.birth,
      nation: p.nation,
      positions: p.positions.clone(),
      values: p.values.clone(),
      contract_end: contract.and_then(|c| c.end),
      wage: contract.map_or(0, |c| c.wage),
      value: p.value,
      avg_rating,
      rated_matches,
      on_loan,
      host_club,
    }
  }

  /// Équipes de jeunes et équipes affiliées du club (U19, B, C…), avec leurs joueurs.
  ///
  /// - les équipes du club après la première (`teams[1..]`) sont les équipes de jeunes, dans l'ordre du jeu ;
  /// - une équipe d'un autre club est affiliée (B, C…) quand au moins `MIN_AFFILIATE` joueurs y jouent avec
  ///   le club comme premier contrat et l'équipe comme dernier : un joueur prêté garde l'équipe A en dernier contrat.
  ///   Elles sont classées par identifiant d'équipe.
  pub fn club_youth(&self, club_id: u32) -> Result<Vec<YouthPlayer>, String> {
    const MIN_AFFILIATE: usize = 5;
    let club = self.clubs.iter().find(|c| c.id == club_id).ok_or("club introuvable")?;
    let first = *club.teams.first().ok_or("ce club n'a pas d'équipe")?;
    let mut counts: HashMap<u32, usize> = HashMap::new();
    for p in &self.players {
      let affiliated = p.team != NONE
        && !club.teams.contains(&p.team)
        && p.contracts.first().map(|c| c.team) == Some(first)
        && p.contracts.last().map(|c| c.team) == Some(p.team);
      if affiliated {
        *counts.entry(p.team).or_default() += 1;
      }
    }
    let mut affiliates: Vec<u32> = counts.into_iter().filter(|&(_, n)| n >= MIN_AFFILIATE).map(|(t, _)| t).collect();
    affiliates.sort_unstable();
    // (équipe, nature, rang) : nature 0 = jeunes, 1 = affiliée
    let mut teams: Vec<(u32, u8, u8)> = club.teams.iter().skip(1).enumerate().map(|(i, &t)| (t, 0, i as u8)).collect();
    teams.extend(affiliates.iter().enumerate().map(|(i, &t)| (t, 1, i as u8)));
    let mut out = Vec::new();
    for p in &self.players {
      if let Some(&(_, kind, rank)) = teams.iter().find(|(t, _, _)| *t == p.team) {
        out.push(YouthPlayer { kind, rank, player: self.save_player(p, first, false, String::new()) });
      }
    }
    Ok(out)
  }

  /// Base de scouting : tous les joueurs, en binaire compact (décodé par src/domain/scouting.ts).
  ///
  /// `FMS6`, horodatage u64 (ms), chemin [u16 + texte], date du jeu (jour u16, année u16, 0 si inconnue),
  /// clubs [u32 n] × (nation u16, nom [u16 + texte]), joueurs [u32 n] × (15 postes, 54 valeurs, naissance jour/année u16,
  /// nation u16, club u32, club propriétaire u32 (FFFFFFFF si aucun), fin de contrat jour/année u16, salaire hebdomadaire u32 (£),
  /// valeur u32 (£, FFFFFFFF si inconnue), somme des notes×10 de la saison u16, matchs notés u8,
  /// stats de la saison : minutes u16, titularisations, entrées, buts, passes D, homme du match (u8), passes tentées,
  /// réussies, tacles tentés, gagnés, dribbles, tirs, cadrés, xG×100, xA×100 (u16), fautes commises, subies, duels aériens,
  /// gagnés, hors-jeu, centres, réussis (u16), arrêts, buts encaissés (u8), nom [u8 + texte]).
  /// `FMS5` : sans les stats après xA ; `FMS4` : sans les stats ; `FMS3` : sans les notes non plus ; `FMS2` : sans la valeur non plus.
  pub fn scouting_snapshot(&self, path: &str, refreshed_at: u64) -> Vec<u8> {
    fn text16(out: &mut Vec<u8>, s: &str) {
      let b = &s.as_bytes()[..s.len().min(u16::MAX as usize)];
      out.extend_from_slice(&(b.len() as u16).to_le_bytes());
      out.extend_from_slice(b);
    }
    let owner = self.team_owner();
    let mut out = Vec::with_capacity(self.players.len() * 136 + self.clubs.len() * 24);
    out.extend_from_slice(b"FMS6");
    out.extend_from_slice(&refreshed_at.to_le_bytes());
    text16(&mut out, path);
    let date = self.game_date.unwrap_or(GameDate { day: 0, year: 0 });
    out.extend_from_slice(&date.day.to_le_bytes());
    out.extend_from_slice(&date.year.to_le_bytes());
    out.extend_from_slice(&(self.clubs.len() as u32).to_le_bytes());
    for c in &self.clubs {
      out.extend_from_slice(&(c.nation as u16).to_le_bytes());
      text16(&mut out, if c.short_name.is_empty() { &c.name } else { &c.short_name });
    }
    out.extend_from_slice(&(self.players.len() as u32).to_le_bytes());
    let index = |team: u32| owner.get(&team).map_or(NONE, |&i| i as u32);
    for p in &self.players {
      out.extend_from_slice(&p.positions);
      out.extend_from_slice(&p.values);
      out.extend_from_slice(&p.birth.day.to_le_bytes());
      out.extend_from_slice(&p.birth.year.to_le_bytes());
      out.extend_from_slice(&(p.nation as u16).to_le_bytes());
      let club = index(p.team);
      out.extend_from_slice(&club.to_le_bytes());
      // club propriétaire, s'il est différent (joueur prêté) : celui du dernier contrat
      let owned_by = p.contracts.last().map_or(NONE, |c| index(c.team));
      out.extend_from_slice(&(if owned_by == club { NONE } else { owned_by }).to_le_bytes());
      let contract = p.contracts.iter().find(|c| index(c.team) == club && club != NONE).or(p.contracts.first());
      let end = contract.and_then(|c| c.end).unwrap_or(GameDate { day: 0, year: 0 });
      out.extend_from_slice(&end.day.to_le_bytes());
      out.extend_from_slice(&end.year.to_le_bytes());
      out.extend_from_slice(&contract.map_or(0, |c| c.wage).to_le_bytes());
      out.extend_from_slice(&p.value.unwrap_or(NONE).to_le_bytes());
      // notes de la saison : somme×10 (u16) et matchs (u8), 0 si aucune
      let s = self.stats.get(&p.id).copied().unwrap_or_default();
      let (sum, apps) = if s.rated > 255 || s.rating_sum > u32::from(u16::MAX) { (0, 0) } else { (s.rating_sum, s.rated) };
      out.extend_from_slice(&(sum as u16).to_le_bytes());
      out.push(apps as u8);
      // stats détaillées de la saison (FMS5)
      out.extend_from_slice(&s.minutes.to_le_bytes());
      out.extend_from_slice(&[s.starts, s.subs, s.goals, s.assists, s.pom]);
      for v in [s.passes, s.passes_done, s.tackles, s.tackles_won, s.dribbles, s.shots, s.shots_on_target, s.xg, s.xa] {
        out.extend_from_slice(&v.to_le_bytes());
      }
      // FMS6
      for v in [s.fouls, s.fouled, s.aerials, s.aerials_won, s.offsides, s.crosses, s.crosses_done] {
        out.extend_from_slice(&v.to_le_bytes());
      }
      out.extend_from_slice(&[s.saves, s.conceded]);
      let name = &p.name.as_bytes()[..p.name.len().min(255)];
      out.push(name.len() as u8);
      out.extend_from_slice(name);
    }
    out
  }
}

/// Clé du cache : chemin, taille et date de modification (le jeu réécrit le fichier à chaque sauvegarde).
fn cache_key(path: &str) -> Result<String, String> {
  let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
  let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis());
  Ok(format!("{path}|{}|{modified}", meta.len()))
}

fn cached(key: &str) -> Option<Arc<ParsedSave>> {
  let cache = CACHE.lock().ok()?;
  cache.as_ref().filter(|(k, _)| k == key).map(|(_, s)| s.clone())
}

/// Lit une sauvegarde (ou reprend la dernière lue si le fichier n'a pas changé) et la garde en mémoire.
pub fn load(path: &str) -> Result<Arc<ParsedSave>, String> {
  let key = cache_key(path)?;
  if let Some(s) = cached(&key) {
    return Ok(s);
  }
  let file = std::fs::read(path).map_err(|e| e.to_string())?;
  let parsed = Arc::new(parse(&file)?);
  if let Ok(mut cache) = CACHE.lock() {
    *cache = Some((key, parsed.clone()));
  }
  Ok(parsed)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn date_ignores_flag_bits() {
    let d = [0xd4, 0x12, 0xea, 0x07];
    assert_eq!(date_at(&d, 0), GameDate { day: 212, year: 2026 });
  }

  #[test]
  fn reads_name_tables() {
    let mut d = vec![9u8; 5];
    for t in 0..3 {
      for id in 0..1200u32 {
        let s = format!("n{t}-{id}");
        d.extend_from_slice(&id.to_le_bytes());
        d.extend_from_slice(&(s.len() as u32).to_le_bytes());
        d.extend_from_slice(s.as_bytes());
      }
      d.extend_from_slice(&[7, 7, 7]);
    }
    let tables = name_tables(&d);
    assert_eq!(tables.len(), 3);
    assert_eq!(tables[1][42], "n1-42");
    assert_eq!(tables[2].len(), 1200);
  }

  /// Sur une vraie sauvegarde : `FM_SAVE=chemin.fm cargo test --release -- --ignored --nocapture`
  #[test]
  #[ignore]
  fn reads_real_save() {
    let path = std::env::var("FM_SAVE").expect("FM_SAVE");
    let t = std::time::Instant::now();
    let save = load(&path).unwrap();
    let s = save.summary();
    println!("{:?} manager {} club {:?} date {:?}", t.elapsed(), s.manager, s.managed_club_id, s.game_date);
    println!("joueurs {} clubs {}", s.total_players, s.clubs.len());
    // un faux repère ferait lire deux fois la même fiche d'identité
    let mut seen = std::collections::HashSet::new();
    let dup = save.players.iter().filter(|p| !seen.insert(p.marker)).count();
    println!("fiches lues deux fois {dup}");
    let players = save.club_players(s.managed_club_id.unwrap()).unwrap();
    if let Ok(out) = std::env::var("FM_SAVE_OUT") {
      std::fs::write(out, serde_json::to_string(&players).unwrap()).unwrap();
    }
    if let Ok(out) = std::env::var("FM_SCOUT_OUT") {
      std::fs::write(out, save.scouting_snapshot(&path, 0)).unwrap();
    }
    let mut youth: std::collections::BTreeMap<(u8, u8), usize> = Default::default();
    for y in save.club_youth(s.managed_club_id.unwrap()).unwrap() {
      *youth.entry((y.kind, y.rank)).or_default() += 1;
    }
    println!("jeunes/affiliés (nature, rang) -> joueurs : {youth:?}");
    for p in &players {
      println!("{} né {:?} nation {} fin {:?} salaire {} £ valeur {:?} £ note {:?} ({} matchs) prêt {} {}", p.name, p.birth, p.nation, p.contract_end, p.wage, p.value, p.avg_rating, p.rated_matches, p.on_loan, p.host_club);
    }
  }

  /// Fiche de stats : emplacements `01 07` (voir `read_slot`), résumé de saison, bloc de notes, `01` et fiche suivante.
  fn stats_record(d: &mut Vec<u8>, slots: &[[u16; 6]], entries: &[(u16, u8)], notes: &[u8], next: u32) {
    for &[sum, minutes, starts, subs, rated, goals] in slots {
      let mut s = vec![0u8; 155];
      s[0..2].copy_from_slice(&sum.to_le_bytes());
      s[2..4].copy_from_slice(&minutes.to_le_bytes());
      s[4] = starts as u8;
      s[5] = subs as u8;
      s[6] = rated as u8;
      s[7] = goals as u8;
      s[89..91].copy_from_slice(&(goals * 90).to_le_bytes());
      d.extend_from_slice(&[1, 7]);
      d.extend_from_slice(&s);
    }
    for &(sum, apps) in entries {
      d.extend_from_slice(&[2]);
      d.extend_from_slice(&sum.to_le_bytes());
      d.extend_from_slice(&[12, apps, 1, 1, apps]);
    }
    d.push(0x10);
    for _ in notes.len()..16 {
      d.extend_from_slice(&[0, 0, 0]);
    }
    for &n in notes {
      d.extend_from_slice(&[n, 0x12, 7]);
    }
    d.push(1);
    d.extend_from_slice(&next.to_le_bytes());
    d.extend_from_slice(&[0xff; 4]);
    d.extend_from_slice(&[0; 40]);
  }

  /// La fiche du joueur X suit le repère « 01 X+1 » ; sans emplacement, la note vient du résumé de saison.
  #[test]
  fn reads_season_ratings() {
    let mut d = vec![0u8; 16];
    stats_record(&mut d, &[], &[], &[], 42566);
    // Oyarzábal (id 42565) : 538/8 en liga + 72/1 en coupe = 6,778
    stats_record(&mut d, &[], &[(538, 8), (72, 1)], &[72, 64, 62, 78, 67, 65, 66, 68, 68], 42567);
    stats_record(&mut d, &[], &[], &[70], 42568);
    let r = season_stats(&d);
    assert_eq!((r[&42565].rating_sum, r[&42565].rated), (610, 9));
    assert_eq!(r[&42566].rated, 0);
  }

  /// Emplacements : sélection, liga, coupe, total (= liga + coupe), saison passée.
  #[test]
  fn picks_season_total_slot() {
    let mut d = vec![0u8; 16];
    stats_record(&mut d, &[], &[], &[], 10250);
    let slots = [[135, 180, 2, 0, 2, 0], [1269, 1007, 7, 19, 19, 6], [148, 57, 1, 1, 2, 0], [1417, 1064, 8, 20, 21, 6], [403, 149, 0, 7, 6, 1]];
    stats_record(&mut d, &slots, &[(1417, 21)], &[67, 70], 10251);
    // un seul emplacement : c'est le total
    stats_record(&mut d, &[[1388, 1710, 19, 0, 19, 4]], &[], &[73], 10252);
    // total = liga + coupe, avec un emplacement étranger glissé entre elles et le total
    let kubo = [[62, 90, 1, 0, 1, 0], [925, 820, 9, 11, 14, 1], [341, 409, 4, 2, 5, 0], [841, 585, 3, 9, 12, 4], [1266, 1229, 13, 13, 19, 1]];
    stats_record(&mut d, &kubo, &[], &[66], 10253);
    stats_record(&mut d, &[], &[], &[70], 10254);
    let r = season_stats(&d);
    let kone = r[&10249];
    assert_eq!((kone.minutes, kone.starts, kone.subs, kone.goals, kone.rated, kone.rating_sum, kone.xg), (1064, 8, 20, 6, 21, 1417, 540));
    assert_eq!((r[&10250].starts, r[&10250].goals), (19, 4));
    assert_eq!((r[&10251].starts, r[&10251].subs, r[&10251].rated), (13, 13, 19));
  }

  /// Sur une sauvegarde déjà décompressée : `FM_RAW=save.bin FM_IDS=42565,33445 cargo test --release season_stats_raw -- --ignored --nocapture`
  #[test]
  #[ignore]
  fn season_stats_raw() {
    let d = std::fs::read(std::env::var("FM_RAW").expect("FM_RAW")).unwrap();
    let r = season_stats(&d);
    println!("{} joueurs notés, {} avec minutes", r.values().filter(|v| v.rated > 0).count(), r.values().filter(|v| v.minutes > 0).count());
    for id in std::env::var("FM_IDS").unwrap_or_default().split(',').filter_map(|s| s.parse::<u32>().ok()) {
      println!("{id}: {:?}", r.get(&id));
    }
  }

  #[test]
  fn detects_player_block() {
    let mut d = vec![0u8; 8];
    d.extend_from_slice(&[1; 15]);
    d.extend_from_slice(&[50; 54]);
    d.extend_from_slice(&[0, 0, 0, 0, 0, 83, 0, 0xcb, 0x07, 1, 0, 0x6c, 0x07]);
    d.extend_from_slice(&[0; 40]);
    assert!(is_block(&d, 8));
    assert!(!is_block(&d, 9));
  }
}
