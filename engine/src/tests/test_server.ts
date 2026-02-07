// Will create this and upload once your work is done...
// FOr now you all create your own tests and run

import WebSocket from "ws";
import { LanForgeServer } from "../server/Server";
import { MessageType } from "../network/MessageTypes";
import { NetworkMessage } from "../network/Protocol";
import { decodeMessage, serializeMessage } from "../network/Encoder";
import { createUniqueId } from "../utils/id";

const PORT = 8080;
const server = new LanForgeServer();

// // Start the server
console.log("Starting server...");
server.start(PORT);

// Simulate a client
setTimeout(() => {
    console.log("Connecting client...");
    const ws = new WebSocket(`ws://localhost:${PORT}`);

    ws.on("open", () => {
        console.log("Client connected");

        // Send PING
        const pingMsg: NetworkMessage = {
            type: MessageType.PING,
            requestId: createUniqueId("req-"),
            clientId: "test-client",
            payload: {},
        };
        ws.send(serializeMessage(pingMsg));
        console.log("Sent PING");

        // Send ECHO
        const echoMsg: NetworkMessage = {
            type: MessageType.ECHO,
            requestId: createUniqueId("req-"),
            clientId: "test-client",
            payload: { text: "Hello World" },
        };
        ws.send(serializeMessage(echoMsg));
        console.log("Sent ECHO");

        // Send CREATE_ROOM (New Test)
        const dynamicRoomName = `Room-${Date.now()}`;
        const createRoomMsg: NetworkMessage = {
            type: MessageType.CREATE_ROOM,
            requestId: createUniqueId("req-"),
            clientId: "test-client",
            payload: { roomName: dynamicRoomName, maxPlayers: 4 },
        };
        ws.send(serializeMessage(createRoomMsg));
        console.log(`Sent CREATE_ROOM: ${dynamicRoomName}`);
    });

    ws.on("message", (data: any) => {
        const msg = decodeMessage(data.toString());
        console.log("Received:", msg);

        if (msg?.type === MessageType.PONG) {
            console.log("PONG received, test passed!");
        } else if (msg?.type === MessageType.ROOM_STATE) {
            console.log("ROOM_STATE received:", msg.payload);
        } else if (msg?.type === MessageType.ERROR) {
            console.error("ERROR received:", msg.payload);
        }
    });

    // Close after 5 seconds
    setTimeout(() => {
        ws.close();
        console.log("Client closed");
        process.exit(0);
    }, 5000);

}, 1000);
