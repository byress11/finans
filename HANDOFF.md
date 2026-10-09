# HANDOFF
Hedef: Kameradan fiş okumayı ve tutar/tarih ayrıştırmayı iyileştirmek; GitHub üzerinden yayınlamak.
Yapılan:
- Yüksek çözünürlüklü kamera isteği, sınırlı boyutta görüntü işleme, kontrast iyileştirme ve zayıf sonuçta ikinci OCR geçişi eklendi.
- Türkçe+İngilizce OCR, fotoğraf döndürme ve tekrar okuma; tutar/tarih kontrol uyarıları eklendi. Okunamayan tarih boş bırakılıyor.
- Toplam tutar öncelikleri, iptal/worker temizliği, çift kaydetme ve çok sözcüklü kategori eşleştirmesi düzeltildi. SW v10.
- 51 test başarılı. Gerçek tarayıcı/Tesseract ile sentetik fişte toplam 120 TL, tarih 2026-09-30 ve TEST MARKET doğru okundu (motor güveni 92).
Sıradaki:
- [ ] GitHub gönderimi ve Pages yayın doğrulaması.
Notlar/kararlar: Gerçek verilere/yedeklere dokunulmadı. OCR tarayıcı içinde. Gerçek telefon/düşük ışıklı fiş testi yapılmadı. Önceki mobil başlık düzeltmesi korundu.
Son güncelleyen: codex — 2026-10-09
