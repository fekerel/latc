# LATC

LATC, ağdaki DLNA/UPnP cihazlarla medya oynatma senaryoları üzerinde çalışılan deneysel bir projedir.

Şu anda üzerinde çalışılan başlıca yetenekler şunlardır:

- Ağdaki uyumlu cihazları SSDP ile keşfetmek ve kullanılabilirliklerini takip etmek
- Bir DLNA controller olarak hedef cihazlara UPnP komutları göndermek
- Hedef cihazda medya kaynaklarının URL'lerini açmak ve oynatmayı kontrol etmek
- İnternet üzerindeki medya kaynaklarını hedef cihaza uygun biçimde proxy'lemek
- Gerektiğinde FFmpeg kullanarak medya akışlarını dönüştürmek (transcode)

Bu liste projenin nihai kapsamını veya gelecekteki mimari sınırlarını tanımlamaz; yalnızca güncel geliştirme odağını anlatır.

## Kurulum

```powershell
npm install
```

Proxy ve transcode işlevleri için FFmpeg'in sistemde kurulu ve komut satırından erişilebilir olması gerekir.

## Çalıştırma

Sunucuyu başlatmak için:

```powershell
npm run server
```

Discovery WebSocket endpoint'i:

```text
ws://localhost:3000/discovery
```

Basit WebSocket istemcisini çalıştırmak için:

```powershell
npm run client
```
