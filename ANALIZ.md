# Hızlı Bütçe — uygulama analizi

**Güncelleme:** Bu ilk incelemedeki yerel kod sorunları için düzeltmeler uygulandı. Güncel davranışlar, 26 testin kapsamı ve canlı ortamda doğrulanmamış noktalar [DUZELTMELER.md](DUZELTMELER.md) dosyasındadır. Aşağıdaki bulgular ilk incelemenin tarihsel kaydıdır; dosya konumları yeniden düzenlendi.

Tarih: 9 Ekim 2026. Kapsam: yerel kaynak kod incelemesi, graphify yapısal haritası, Node.js regresyon testleri ve sahte veri katmanıyla senkronizasyon kontrolleri. Canlı Firebase hesabına bağlanılmadı; tarayıcı arayüzü, kamera/OCR, cihazlar arası gerçek senkronizasyon ve sunucu güvenlik kuralları test edilmedi.

## Genel değerlendirme

Uygulama kişisel kullanım için geniş bir özellik kümesine sahip: profil bazlı gelir/gider, kategori yönetimi, borç/alacak, yatırım, fatura, zengin metin notları, raporlar, fiş tarama ve Firebase senkronizasyonu. Yeni özellik eklemeden önce veri kaybını önleme ve hesapların doğruluğunu güvenceye alma öncelikli olmalı.

Mevcut yapıyı değiştirmek için bir framework geçişi gerekmiyor. Önce veri erişimi, senkronizasyon ve görünüm sorumluluklarını ayırmak daha ölçülebilir bir adım.

## Mimari

| Parça | Görev | Gözlem |
|---|---|---|
| `index.html`, `css/` | Ana kabuk, mobil görünüm, modallar | Harici CDN üzerinden Chart.js, Firebase ve ikon/font kaynakları yükleniyor. |
| `js/app.js` | IndexedDB, uygulama durumu, profiller, ekranlar, içe/dışa aktarma | Yaklaşık 6.000 satır; veri ve görünüm aynı dosyada. |
| `js/modules.js` | Borç, yatırım, fatura, not ve rapor servisleri | Bazı servislerde doğrulama ve zaman damgası davranışları tutarsız. İkinci bir yedekleme akışı var. |
| `js/firebase-config.js` | Kimlik doğrulama, buluta gönderme, birleştirme, silme kuyruğu | Birden fazla yazma/silme yolu aynı veriyi değiştirebiliyor. |
| `js/receipt-scanner.js` | Kamera, Tesseract OCR, fiş ayrıştırma | Ayrı bir dosyada olması iyi bir sorumluluk ayrımı. |
| `sw.js`, `manifest.json` | PWA ve çevrimdışı önbellek | Gerekli yerel varlıkların tamamı kurulum önbelleğinde değil. |

Veri akışı: ekran → yönetici → IndexedDB → AppState → ekran. Bulut yüklemelerinin çoğu AppState üzerinden yapılıyor; indirme ve gerçek zamanlı dinleyiciler IndexedDB'ye yazıp görünümü yeniliyor. `DataManager.loadProfileData` bazı koleksiyonları yalnızca aktif profil için yüklerken borçları ve faturaları bilerek ortak yüklüyor. Bu kapsam farkı servis sözleşmelerinde açıkça tanımlanmalı.

Graphify, `js/` içindeki dört kaynak dosyasından 88 düğüm ve 105 bağlantı çıkardı. Nesne içindeki metot çağrıları eksik temsil edildiğinden grafik tam bir çağrı haritası olarak kullanılmamalı. Bulgular kaynak kodla ayrıca kontrol edildi. Harita: `graphify-out/graph.html`; otomatik rapor: `graphify-out/GRAPH_REPORT.md`. AST çıkarımı için model token maliyeti 0; oturumdaki inceleme maliyeti bu sayıya dahil değil.

## Bu incelemede düzeltildi

1. **Eksik çoklu profil yedeği:** `exportData`, tüm profilleri listelerken işlem, kategori, yatırım ve notları aktif profilin AppState dizilerinden alıyordu. Artık yedi veri deposunun tamamını IndexedDB'den okuyor. JSON biçimi korundu; okuma başarısız olursa kısmi dosya indirilmiyor. Bu işlem ayrı okumalardan oluşuyor; eşzamanlı yazmalara karşı tek anlık veritabanı görüntüsü garantisi henüz yok.
2. **Ayın son gününün rapordan düşmesi:** `getMonthlyData`, bitişi son günün gece yarısı olarak alıyordu. Türkiye saat diliminde son günün tarih girdileri sınırın dışında kalabiliyordu. Aralık artık ayın ilk günü dahil, sonraki ayın ilk günü hariç.
3. **Gece yarısından sonra yanlış varsayılan tarih:** `formatDateInput`, UTC tarihini kullanıyordu. Türkiye'de 00:30'da önceki gün seçilebiliyordu. Artık yerel yıl, ay ve gün kullanılıyor.

Doğrulama: `node --test tests/core.test.cjs` — 5/5 başarılı. Testler ay sonunu, komşu ayları, artık günü, yıl geçişini, yerel gece yarısını, iki profilli yedeği ve veritabanı okuma hatasını kapsıyor. Hatalı eski kodda beş test de başarısızdı. Testler DOM ve veritabanı yerine kontrollü taklitler kullanır; tarayıcı uçtan uca testi değildir. Beş uygulama JavaScript dosyası için sözdizimi kontrolü de geçti.

## İlk incelemede saptanan bulgular

### P0 — Yüklenmemiş yerel kayıt silinebiliyor

Kaynak: `js/firebase-config.js`, `handleImplicitDeletions` ve `syncFromCloud`.

Bulutta bulunmamak silinmiş olmakla eş tutuluyor. `itemTime <= lastSyncTime + 60000` koşulu, son senkronizasyondan **sonra** oluşturulmuş kayıtları da silebiliyor. Üstelik son senkronizasyon zamanı indirme sonunda da ilerletiliyor; başarılı yükleme kanıtı değil.

İzole doğrulama: bulutta bir profil var, işlem koleksiyonu boş; yerel işlem son senkronizasyondan 30 saniye sonra oluşturulmuş. Metot yerel işlemi sildi.

Çözüm: yalnızca açık silme kayıtlarını uygulamak; değişiklikleri IndexedDB'de kalıcı gönderim kuyruğuna yazmak; başarılı yükleme onayını kayıt bazında tutmak. Koleksiyonda yokluk, tek başına silme kararı olmamalı.

### P0 — Eski bulut kaydı yeni yerel değişikliğin üzerine yazılıyor

Kaynak: `js/firebase-config.js`, `handleRealtimeSnapshot`.

Normal birleştirme yolu zaman damgası karşılaştırırken gerçek zamanlı dinleyici doğrudan `DBManager.put` çağırıyor. Yerel çevrimdışı değişiklikler dinleyicinin ilk görüntüsüyle kaybolabilir.

İzole doğrulama: yerelde 9 Ekim tarihli tutar 99 iken 1 Ekim tarihli bulut tutarı 10 gönderildi; eski kayıt için yazma çağrısı gerçekleşti.

Çözüm: bütün indirme yollarında aynı çakışma çözümünü kullanmak; bekleyen yerel değişiklikleri korumak; revizyon ve sunucu onayı tasarlamak. Sadece cihaz saatine güvenmek kalıcı çözüm olmamalı.

### P0 — Hesaplar yerel veri katmanında ayrılmamış

Kaynak: `js/app.js` içindeki sabit `HizliButceDB`; `js/firebase-config.js` içindeki kimlik değişimi, `signOut`, `syncToCloud`, `pendingDeletes` ve `lastSyncTime` anahtarları.

Çıkış sonrası IndexedDB aynı kalıyor. Başka hesapla girişte aynı yerel kayıtlar yeni kullanıcının bulut yoluna gönderilebilir veya yeni hesabın verileriyle karışabilir. Silme kuyruğu da kullanıcıya bağlı değil. Bu sonuç kaynak akışından çıkarıldı; gerçek iki hesapla denenmedi.

Çözüm: kullanıcı kimliğine göre veri alanı ve kuyruk ayrımı; oturumsuz veriyi hesaba taşıma için açık ürün akışı; kullanıcı değişince devam eden işlemlerin eski oturuma ait olduğunun kontrolü. Yerel veriyi otomatik silmek çözüm olarak uygulanmamalı.

### P1 — İçe aktarma ve zorunlu eşitleme kısmi veri bırakabilir

Kaynak: `js/app.js`, `importData`; `js/firebase-config.js`, `forceReplaceFromCloud`, `forceUploadToCloud`.

İçe aktarma yalnızca `version` ve `profiles` varlığını kontrol ediyor; mevcut depoları temizledikten sonra kayıtları tek tek yazıyor. Örneğin geçerli görünen ama yinelenen kimlik içeren bir yedek, temizleme sonrasında yazma hatası üretir. İşlem tek atomik transaction olmadığı için eski veriler geri gelmez. İçe aktarma sırasında senkronizasyon da durdurulmuyor. Zorunlu bulut indirmesinde bazı yazma hataları yakalanıp devam ediliyor; sonunda başarı mesajı gösterilebiliyor. Zorunlu yükleme ise bulutu önce temizliyor.

Çözüm: tüm yedeği önce şema, tip, kimlik ve ilişki açısından doğrulamak; yerel değiştirmeyi tek transaction ile yapmak; başarısızlıkta rollback; senkronizasyonu kontrollü durdurmak; toplu bulut değiştirmede sürümlü veri alanı kullanmak.

### P1 — Kalıcı HTML içeriği güvenli biçimde sınırlandırılmıyor

Kaynak: `js/app.js`, `NotesPage.openEditModal` (`editor.innerHTML = note.content`), `Utils.showToast`, `Dialog.show`, `Utils.iconHTML`.

Not içeriği yedekten veya buluttan gelip doğrudan HTML olarak işlenebiliyor. Metin kaçış yardımcıları var ama tüm HTML/özellik bağlamlarında kullanılmıyor. Kullanıcı tarafından sağlanan profil adı da HTML kullanan toast mesajına giriyor. Bu bir kaynak kod bulgusudur; tarayıcıda saldırı örneği çalıştırılmadı.

Çözüm: düz metinler için `textContent`; zengin metin için izin listesiyle temizleme; ikon, renk ve kimlik alanlarında doğrulama; inline olay işleyicilerini aşamalı kaldırma.

### P1 — IndexedDB yazma başarısı erken bildiriliyor

Kaynak: `js/app.js`, `DBManager.add/put/delete/clear`.

Promise'ler transaction tamamlandığında değil, tek isteğin `onsuccess` olayında çözülüyor. Transaction sonradan iptal olursa çağıran kod başarı varsaymış olabilir.

Çözüm: yazmaları `tx.oncomplete` üzerinde sonuçlandırmak; `tx.onabort/onerror` durumlarını taşımak. Çok depolu işlemleri aynı transaction içinde toplamak.

### P2 — PWA, tarih ve doğrulama tutarlılığı

- `sw.js` kurulum listesinde `modules.js`, `firebase-config.js`, `receipt-scanner.js`, mobil CSS ve ikonlar eksik. Çalışma anındaki önbellek bazen bu açığı kapatabilir; kurulum listesi tek başına çevrimdışı açılmayı güvenceye almıyor. Cache temizliği de yalnızca uygulamanın kendi isim önekini hedeflemeli.
- `BillManager.calculateNextDueDate` aylığı 30 gün, yıllığı 365 gün sayıyor. Takvim ayı ve artık yıl davranışı ürün beklentisine göre tanımlanmalı.
- `DebtManager.addPayment` negatif/aşırı ödeme tutarlarını servis katmanında reddetmiyor; bazı güncellemeler `updatedAt` yazmıyor.
- İşlem undo/redo geçmişi profil değişiminde ayrılmıyor. Başka profile geçip geri alma yapılırsa eski profilin işlemi aktif listeye eklenebilir. Profil başına geçmiş tutulmalı veya geçişte temizlenmeli.
- JSON yedeği ile `BackupManager` içindeki `.fpb` akışı farklı. `.fpb` için kullanılan Base64 gerçek şifreleme değil; ortak, sürümlü bir yedek servisi oluşturulmalı.
- Depoda Firestore kuralları/emülatör testleri bulunmadı. Canlı erişim kurallarının güvenliği bu incelemeden anlaşılamaz.

## Önerilen geliştirme sırası

1. **Veri güvenilirliği:** kullanıcı bazlı yerel alan, kalıcı gönderim kuyruğu, açık silme kayıtları, ortak çakışma çözümü. Kabul: iki cihazda çevrimdışı ekleme/düzenleme/silme, bağlantı kopması ve hesap değiştirme veri kaybetmemeli.
2. **Yedek geri yükleme:** şema doğrulama, atomik yazma ve hata kurtarma. Kabul: bozuk dosya, yinelenen kimlik ve yarıda kesilen yazma mevcut veriyi değiştirmemeli.
3. **Kod ayrımı ve güvenli görünüm:** DB, servisler, hesaplama yardımcıları ve ekranları ayır; HTML işleme yollarını sınırlandır. Framework kararı bundan sonra verilebilir.
4. **Ürün gelişimi:** kategori bazlı aylık bütçe/limit, yinelenen işlem üretimi, CSV içe aktarma önizlemesi, faturadan gider kaydı ve görülebilir senkronizasyon durumu. Özellikle “yerelde kaydedildi / buluta gönderilmeyi bekliyor / eşitlendi” ayrımı veri durumunu kullanıcıya anlatır.

Bu ilk inceleme sonrasında kullanıcı düzeltmeleri onayladı; uygulanan çalışmalar DUZELTMELER.md dosyasında listelenmiştir. Önceki kullanıcı değişiklikleri korundu; commit veya dağıtım yapılmadı.
