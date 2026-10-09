# HANDOFF
Hedef: Mobil kaydırmada profil şeridinin ortada kalmasını ve başlığın kaybolmasını düzeltmek.
Durum: DEVAM EDİYOR
Yapılan:
- Kullanıcının iPhone görüntüsünde başlık ve profil alanının bağımsız sticky davranışı görüldü.
- İkisi tek app-topbar kapsayıcısında birleştirildi. Mobilde tek fixed üst bölüm; safe-area üst boşluğu dahil yüksekliği ResizeObserver ile ölçülerek içerikte yer ayrılıyor. Masaüstünde tek sticky kapsayıcı.
- SW v9.
Sıradaki:
- [ ] Mobilde başta/ortada/sonda kaydırma ve yatay dönüş kontrolü; masaüstü kontrolü.
- [ ] Mevcut testler ve GitHub Pages yayını.
Notlar/kararlar: Gerçek veriye ve yedeklere dokunma. Önceki arayüz güncellemesi a0a1411 ve 42 test başarılıydı.
Son güncelleyen: codex — 2026-10-09
- 42/42 test ve diff kontrolü geçti. 390px mobilde 844px kaydırma öncesi/sonrası üst bölüm top=0, başlık=0, profil=56px olarak korundu; yüksekliği ve içerik boşluğu 161px eşleşti.
- 740px yatay mobilde yükseklik/boşluk 162px eşleşti. 1280px masaüstünde sticky top=0, fazladan içerik boşluğu 0px doğrulandı. Gerçek iPhone donanım testi yapılmadı.
- Önizleme sekmeleri/sunucusu kapatıldı; viewport sıfırlandı. Yayına hazır.
