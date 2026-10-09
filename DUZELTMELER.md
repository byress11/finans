# Düzeltmeler — 9 Ekim 2026

## Hızlı Ekle ve kamera güncellemesi (21:12)

Hızlı Ekle'ye isteğe bağlı açıklama alanı eklendi. Açıklama işleme kaydedilir; kayıt hatasında panel/alanlar korunur, çift kaydetme engellenir. Kategori düğmeleri klavyeyle kullanılabilir.

Fiş/Fatura Tara artık doğrudan arka kamerayı tercih ederek açılır. Dosyadan seçim ikincil düğmedir; başlangıçta yöntem sorulmaz. Aynı açık tarama penceresinde tekrar çekim mevcut kamera bağlantısını kullanır. Eşzamanlı açma istekleri birleştirilir; izin reddinde otomatik tekrar yapılmaz. Pencere kapanınca, sayfa arka plana geçince veya terk edilince kamera bırakılır. Sonradan gelen izin/OCR yanıtlarının eski pencereyi değiştirmesi önlenir.

Toplam **34/34 test geçti** (önceki 26 teste 8 hızlı ekleme/kamera testi eklendi). Kamera testleri taklit stream ve jsdom kullanır; gerçek telefon denenmedi. Tarayıcının tek seferlik izin kararları uygulama tarafından kalıcı izne dönüştürülemez; [kamera izinleri tarayıcı tarafından yönetilir](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security). Kamera erişimi için HTTPS veya localhost kullanılmalı.

Analizdeki yerel veri güvenilirliği ve güvenlik düzeltmeleri uygulandı. Canlı Firebase'e bağlanılmadı, dağıtım yapılmadı; mevcut finans verileri üzerinde işlem çalıştırılmadı.

## Değişen davranışlar

- Her Firebase kullanıcısı ayrı IndexedDB alanı kullanır. Oturumsuz/eski `HizliButceDB` korunur; hesaba otomatik karıştırılmaz. Senkronizasyon ekranındaki **Cihazdaki önceki verileri bu hesaba kopyala** seçeneğiyle bilinçli aktarım yapılabilir. Farklı içerikli aynı kimlik varsa aktarım durur.
- Her ekleme/düzenleme/silme, veriyle aynı IndexedDB transaction'ında `pendingSync` kuyruğuna yazılır. Başarı yalnızca transaction tamamlanınca bildirilir. Oturum değiştiğinde eski iş yeni hesap alanına yazamaz.
- Bulutta olmayan kayıt otomatik silinmez. Silme yalnızca açık silme kaydıyla uygulanır; yerelde bekleyen değişiklik korunur.
- Yükleme, kayıt ve silme kaydını Firestore transaction'ında okur; son bilinen bulut içeriği değişmişse çakışma kaydedilir. Kullanıcı senkronizasyon ekranından yerel veya bulut kopyasını seçer. Yerel saat tek başına kazananı belirlemez.
- Bağlantı hatalarında kuyruk kalıcıdır. Yükleme sırasında yeni bir düzenleme yapılırsa yalnızca gönderilmiş sürüm onaylanır, yeni düzenleme kuyrukta kalır. Silmeyi geri alma buluttaki eski silme kaydını kaldırır.
- **Yerel Kayıtları Gönder** artık bulutu önce silmez; yerel kayıtları gönderir, buluta özgü kayıtları korur ve çakışmaları gösterir. Büyük, yıkıcı “bulutu tamamen değiştir” işlemi kaldırıldı.
- Yedekler tek okuma transaction'ıyla tüm profillerden alınır. JSON biçimi `2.0`; `1.0`, `1.0.0` ve eski `.fpb` dosyalarının okunması desteklenir. Base64 şifreleme olarak sunulmaz.
- Geri yükleme önce bütün dosyayı doğrular, sonra yedi veri deposunu ve kuyruğu atomik olarak değiştirir. Hata halinde kısmi yazma kalmaz. Önceki durum ayarlardaki **Son içe aktarma öncesi yedeği indir** seçeneğiyle alınabilir. Geri yüklerken eşitleme durdurulur.
- Not HTML'i yerel olarak paketlenen DOMPurify ile temizlenir. Yapıştırma temizlenir; izin verilmeyen etiketler, olay işleyicileri, bağlantılar ve stiller kaldırılır. Metin alanlarının HTML gösteriminde kaçış uygulanır; ikon isimleri sınırlandırılır.
- Profil değişiminde undo/redo geçmişi temizlenir. Profil silme, ilişkili işlem/kategori/yatırım/notları tek transaction ile silme kuyruğuna alır; ortak borç/faturalar kalır. Metin yazarken Ctrl+Z finansal işlem geri almasını tetiklemez.
- Borç ödemeleri negatif, sıfır, sonlu olmayan veya kalan tutarı aşan değerleri reddeder. Fatura tekrarları takvim ayı/yılı üzerinden hesaplanır; örneğin 31 Ocak → 28 Şubat → 31 Mart. Ödenmiş fatura ve sonraki tekrar aynı transaction'da kaydedilir.
- PWA önbelleği yeni modülleri, mobil CSS'i ve ikonları içerir. Başka uygulamaların cache'leri ve API yanıtları hedeflenmez. Eksik kurulum önbelleğiyle yeni service worker etkinleştirilmez. Chart.js çevrimdışıyken ana ekranın açılması engellenmez.

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `js/database.js` | Hesap alanları, IndexedDB, kalıcı kuyruk, atomik yedek servisi |
| `js/data-safety.js` | Kayıt/yedek doğrulama, zengin metin temizleme |
| `js/sync.js` | Hesap geçişi, yükleme/indirme, çakışma ve tekrar deneme |
| `js/firebase-config.js` | Firebase istemci yapılandırması |
| `js/app.js`, `js/modules.js` | Ekranlar ve iş kuralları; ortak servislere bağlı |
| `js/vendor/purify.min.js` | Sürümü sabitlenmiş DOMPurify; lisansı aynı dizinde |
| `tests/` | Regresyon, IndexedDB, bulut taklidi ve DOM açılış testleri |

## Doğrulama

`npm.cmd test` (Windows) veya `npm test`: **26/26 başarılı**.

- Gerçek transaction davranışını taklit eden `fake-indexeddb`: abort/rollback, yinelenen kimlik, hesap ayrımı, kuyruk kalıcılığı ve geri yükleme.
- Bellek içi Firestore taklidi: bağlantı hatası, işlem sürerken düzenleme, çakışma, silme/geri alma ve oturum değişimi. Bu testler Firebase emülatörü veya canlı hizmet testi değildir.
- jsdom: gerçek `index.html` ve yerel script sırasıyla çevrimdışı açılış, on ana ekranın oluşturulması ve profil değişiminde undo sıfırlama. Bu kontrol görsel tarayıcı/telefon testi değildir.
- Ay sonu, artık gün, takvim tekrarları, borç ödeme doğrulaması, HTML temizliği ve PWA varlık listesi.
- Uygulama JavaScript sözdizimi kontrolleri ve `git diff --check` geçti.

## Yayın öncesinde doğrulanması gerekenler

Canlı Firestore erişim kuralları, gerçek iki cihazlı eşitleme, telefon/kamera/OCR ve service worker'ın gerçek tarayıcıdaki sürüm geçişi burada test edilmedi. Sunucu kuralları değiştirilmedi. Yeni sürüm diğer cihazlarda da kullanılmalı; eski istemcinin silme/birleştirme davranışları bu kod tarafından güncellenemez. Açık başka sekme eski IndexedDB sürümünü tutuyorsa uygulama sekmeleri kapatıp yeniden açmayı ister.

Mevcut `.fpb`/JSON yedekleri şifreli değildir; profildeki PIN de veritabanı şifrelemesi değildir. Bu çalışma hesap alanlarını ayırır, cihazdaki veriyi şifrelemez. Chart.js, Firebase ve OCR hâlâ harici kaynaklara bağlıdır; çevrimdışı ana kayıt kullanımı ile grafik/bulut/OCR kullanılabilirliği aynı değildir.

Yeni ürün özellikleri (bütçe limitleri, CSV önizleme, yinelenen gelir/gider üretimi) bu hata düzeltme kapsamına dahil edilmedi.

Uygulama tasarımında başvurulan belgeler: [IndexedDB transaction tamamlanması](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event), [Firestore transaction](https://firebase.google.com/docs/firestore/manage-data/transactions), [DOMPurify](https://github.com/cure53/DOMPurify).
