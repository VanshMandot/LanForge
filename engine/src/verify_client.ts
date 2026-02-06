import WebSocket from "ws";
import { MessageType } from "./network/MessageTypes";
import { NetworkMessage } from "./network/Protocol";
import { parseIncomingMessage, serializeMessage } from "./network/Encoder";
import { createUniqueId } from "./utils/id";

const PORT = 8080;
const URL = `ws://localhost:${PORT}`;

console.log(`Connecting to server at ${URL}...`);
const ws = new WebSocket(URL);

ws.on("open", () => {
    console.log("Connected to server successfully!");

    // Send PING
    const pingMsg: NetworkMessage = {
        type: MessageType.PING,
        requestId: createUniqueId("verify-"),
        clientId: "verifier",
        payload: {},
    };
    ws.send(serializeMessage(pingMsg));
    console.log("📤 Sent PING");
});

ws.on("message", (data: any) => {
    const msg = parseIncomingMessage(data.toString());

    if (msg?.type === MessageType.PONG) {
        console.log("Received PONG! Server is responsive.");
        console.log("-----------------------------------------");
        console.log("Server is working correctly.");
        ws.close();
        process.exit(0);
    } else {
        console.log("Received unexpected message:", msg);
    }
});

ws.on("error", (err) => {
    console.error("Connection failed. Is the server running?");
    console.error(err.message);
    process.exit(1);
});
