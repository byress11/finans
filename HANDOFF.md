# HANDOFF
Hedef: Güncelleme sonrası görünmeyen eski kullanıcı kayıtlarını kaynağını koruyarak kurtarmak.
Durum: DEVAM EDİYOR
Yapılan:
- Brave RES-A profilinde https://byress11.github.io/finans/ açıldı (sekme 2030158200, handoff işaretli).
- Girişli hesapta RESUL profili geldi; senkronizasyon ekranında Geçersiz işlem hatası görüldü. Yeni doğrulama buluttan eski işlem yüklemeyi engelliyor olabilir.
- Girişli hesap için JSON dışa aktarma tıklandı; download bekleme API zaman aşımına uğradı. Dosyanın diske kaydı doğrulanmadı.
- Uygulama hesabından çıkıldı (kayıt silinmedi); eski guest HizliButceDB alanına geçildi.
- RESUL profilinde İşlemler ekranının ay filtresi temizlendi: Ocak–Nisan 2026 tarihli 16 işlem bulundu! Eski yerel veri korunmuş.
- Eski veri için Ayarlar > Verileri Dışa Aktar (JSON) tıklandı; Veriler başarıyla dışa aktarıldı bildirimi görüldü. Dosya konumu/içeriği henüz doğrulanmadı. Kullanıcıya kaydetme penceresi ve dosya konumu soruldu.
- Sekme İşlemler ekranında 16 kayıt gösterirken açık bırakıldı; hesap şu an çıkış yapılmış halde.
Sıradaki:
- [ ] Kullanıcıdan indirilen yedeğin konumunu al; JSON üzerinde tüm profillerin kayıt sayısını ve eski işlem alanlarını incele.
- [ ] Geçersiz işlem hatasına neden olan eski formatı tespit et; veriyi değiştirmeden uyumlu okuma/kopyalama düzeltmesini test et.
- [ ] Gerekirse kullanıcının hesabına tekrar giriş sonrası eski kayıtları kaynak ve yedek korunarak hesaba kopyala; sonuçları doğrula.
Notlar/kararlar: Site verilerini temizleme, uygulamayı kaldırma veya zorla bulut indirme yapma. Eski DB korunmuş; yeni hesap DB ayrımı ve ay filtresi görünmezliğe yol açıyor. importGuestData aynı ID farklı içerikte duruyor. Gerçek verilere henüz yazma yapılmadı. Önceki yayın main 895de3e, 34 test geçmişti. Yerel uygulama kodu bu kurtarma turunda değiştirilmedi. Brave downloads iç sayfası URL politikası ile engellendi; bu yolu başka araçla aşma. Downloads dizininde hizli-butce-yedek-*.json bulunamadı.
Son güncelleyen: codex — 2026-10-09

Güncel kurtarma bulgusu:
- Kullanıcı 16 işlemin eski bir kopya olduğunu, Eylül ayına kadar kayıtların eksik olduğunu bildirdi. Kurtarma tamamlanmadı.
- Salt okunur bulut incelemesi eklendi: tüm profiller, aylık işlem sayıları, doğrulama hataları ve ham JSON indirme. Gerçek verileri değiştirmez; oturum değişiminde sonuç temizlenir.
- 36/36 test geçti; eski geçersiz kayıt dahil incelemenin veriye yazmadığı ve geç hesap yanıtının gösterilmediği test edildi. SW v6.
- Kullanıcıya en son kayıtları hangi cihazda gördüğü ve uygulamada yeniden giriş yapması soruldu. Şifre istenmedi.
- Sıradaki: bu tanı ekranını GitHub Pages üzerinden yayınla; kullanıcı giriş yapınca bulutta Eylül kayıtlarının varlığını kontrol et.
