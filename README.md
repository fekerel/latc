# LATC

Ilk adim: SSDP ile agdaki cihazlari bulmak.

## Kurulum

Terminalde bu dizinde:

```powershell
npm install
```

## Calistirma

```powershell
npm run scan
```

Bu komut 5 saniye boyunca agdaki SSDP/UPnP cihazlarini dinler ve bulduklarini listeler.

WebSocket sunucusu:

```powershell
npm run server
```

Discovery endpoint:

```text
ws://localhost:3000/discovery
```

Basit WebSocket istemcisi:

```powershell
npm run client
```

## Klasor Yapisi

Kokte calistirma dosyalari ve proje metadatasi var:

```text
package.json
scan.js
server.js
client.js
```

Asil uygulama kodu `src` altinda:

```text
src/app.js
src/api/server.js
src/api/websocket.js
src/common/websocket.js
src/discovery/index.js
src/discovery/discovery-manager.js
src/discovery/device-registry.js
src/discovery/discovery-coordinator.js
src/discovery/discovery-websocket-handler.js
```

`src/discovery/index.js`, discovery modulunun factory dosyasidir. Disariya manager instance'ini acmaz; `createDiscoveryModule()` ile modulun public fonksiyonlarini verir.
