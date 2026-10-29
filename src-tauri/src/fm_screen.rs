//! Lecture de l'écran de FM27 : capture de la fenêtre du jeu et OCR Windows (hors ligne).
//! Rien n'est écrit dans le jeu, et le focus n'est jamais déplacé.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct OcrWord {
  pub t: String,
  pub x: f64,
  pub y: f64,
  pub w: f64,
  pub h: f64,
}

#[derive(Serialize, Clone)]
pub struct Capture {
  /// PNG encodé en base64.
  pub png: String,
  pub width: u32,
  pub height: u32,
  pub words: Vec<OcrWord>,
}

#[cfg(windows)]
mod imp {
  use super::{Capture, OcrWord};
  use base64::Engine;
  use windows::core::{w, HSTRING};
  use windows::Globalization::Language;
  use windows::Graphics::Imaging::BitmapDecoder;
  use windows::Media::Ocr::OcrEngine;
  use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
  use windows::Win32::Foundation::{HWND, POINT, RECT};
  use windows::Win32::Graphics::Gdi::{
    BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
  };
  use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
  use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, GetClientRect, IsIconic};

  fn init_winrt() {
    // Déjà initialisé sur ce thread : l'erreur est sans conséquence.
    unsafe {
      let _ = RoInitialize(RO_INIT_MULTITHREADED);
    }
  }

  /// Pixels RGBA de la zone cliente de la fenêtre de FM27.
  fn grab_window() -> Result<(Vec<u8>, u32, u32), String> {
    unsafe {
      let hwnd: HWND = FindWindowW(None, w!("Football Manager 27")).map_err(|_| "Fenêtre de FM27 introuvable".to_string())?;
      if IsIconic(hwnd).as_bool() {
        return Err("La fenêtre de FM27 est réduite".into());
      }
      let mut rect = RECT::default();
      GetClientRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
      let (width, height) = ((rect.right - rect.left) as i32, (rect.bottom - rect.top) as i32);
      if width <= 0 || height <= 0 {
        return Err("Fenêtre de FM27 de taille nulle".into());
      }
      let mut origin = POINT { x: 0, y: 0 };
      if !ClientToScreen(hwnd, &mut origin).as_bool() {
        return Err("Position de la fenêtre illisible".into());
      }
      let screen = GetDC(None);
      let mem = CreateCompatibleDC(Some(screen));
      let bmp = CreateCompatibleBitmap(screen, width, height);
      let old = SelectObject(mem, bmp.into());
      let copied = BitBlt(mem, 0, 0, width, height, Some(screen), origin.x, origin.y, SRCCOPY);
      let mut info = BITMAPINFO::default();
      info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width,
        biHeight: -height, // image de haut en bas
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
      };
      let mut bgra = vec![0u8; (width * height * 4) as usize];
      let lines = GetDIBits(mem, bmp, 0, height as u32, Some(bgra.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
      SelectObject(mem, old);
      let _ = DeleteObject(bmp.into());
      let _ = DeleteDC(mem);
      ReleaseDC(None, screen);
      if copied.is_err() || lines == 0 {
        return Err("La capture de l'écran a échoué (FM27 est-il visible, au premier plan ?)".into());
      }
      for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2); // BGRA -> RGBA
        px[3] = 255;
      }
      Ok((bgra, width as u32, height as u32))
    }
  }

  fn encode_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    {
      let mut enc = png::Encoder::new(&mut out, width, height);
      enc.set_color(png::ColorType::Rgba);
      enc.set_depth(png::BitDepth::Eight);
      enc.set_compression(png::Compression::Fast);
      let mut writer = enc.write_header().map_err(|e| e.to_string())?;
      writer.write_image_data(rgba).map_err(|e| e.to_string())?;
    }
    Ok(out)
  }

  /// OCR Windows d'une image PNG : mots et rectangles en pixels de l'image.
  pub fn ocr_png(png: &[u8]) -> Result<Vec<OcrWord>, String> {
    init_winrt();
    let run = || -> windows::core::Result<Vec<OcrWord>> {
      let stream = InMemoryRandomAccessStream::new()?;
      let writer = DataWriter::CreateDataWriter(&stream)?;
      writer.WriteBytes(png)?;
      writer.StoreAsync()?.get()?;
      writer.FlushAsync()?.get()?;
      writer.DetachStream()?;
      stream.Seek(0)?;
      let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
      let bitmap = decoder.GetSoftwareBitmapAsync()?.get()?;
      let engine = match OcrEngine::TryCreateFromUserProfileLanguages() {
        Ok(e) => e,
        Err(_) => OcrEngine::TryCreateFromLanguage(&Language::CreateLanguage(&HSTRING::from("en-US"))?)?,
      };
      let result = engine.RecognizeAsync(&bitmap)?.get()?;
      let lines = result.Lines()?;
      let mut words = Vec::new();
      for line in lines {
        for word in line.Words()? {
          let r = word.BoundingRect()?;
          words.push(OcrWord { t: word.Text()?.to_string(), x: r.X as f64, y: r.Y as f64, w: r.Width as f64, h: r.Height as f64 });
        }
      }
      Ok(words)
    };
    run().map_err(|e| format!("OCR Windows indisponible : {e}"))
  }

  /// Capture la fenêtre de FM27 puis lit les textes.
  pub fn capture_fm() -> Result<Capture, String> {
    let (rgba, width, height) = grab_window()?;
    let png = encode_png(&rgba, width, height)?;
    let words = ocr_png(&png)?;
    Ok(Capture { png: base64::engine::general_purpose::STANDARD.encode(&png), width, height, words })
  }
}

#[cfg(windows)]
pub use imp::{capture_fm, ocr_png};

#[cfg(not(windows))]
pub fn capture_fm() -> Result<Capture, String> {
  Err("Capture d'écran disponible uniquement sous Windows".into())
}

#[cfg(not(windows))]
pub fn ocr_png(_png: &[u8]) -> Result<Vec<OcrWord>, String> {
  Err("OCR disponible uniquement sous Windows".into())
}

