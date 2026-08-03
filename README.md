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

Simdilik ana dosyalar:

```text
package.json
scan.js
discovery-manager.js
device-registry.js
discovery-coordinator.js
server.js
client.js
```
