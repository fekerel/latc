import WebSocket from "ws";

const url = process.argv[2] ?? "ws://localhost:3000/discovery";
const socket = new WebSocket(url);

socket.on("open", () => {
  console.log(`Connected: ${url}`);
});

socket.on("message", (data) => {
  const text = data.toString();

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
});

socket.on("close", (code, reason) => {
  console.log(`Closed: ${code} ${reason.toString()}`);
});

socket.on("error", (error) => {
  console.error("WebSocket error:", error.message);
});
