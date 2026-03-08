import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e8, // 100MB buffer for chunks if needed, but we'll stream
  cors: {
    origin: "*",
  }
});

const PORT = 3000;

// Store active rooms and their roles
// roomCode -> { senderId, receiverId, fileMeta }
const rooms = new Map<string, { senderId?: string; receiverId?: string; fileMeta?: any }>();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-room", () => {
    let code: string;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(code));

    rooms.set(code, { senderId: socket.id });
    socket.join(code);
    socket.emit("room-created", code);
    console.log("Room created:", code);
  });

  socket.on("join-room", (code: string) => {
    const room = rooms.get(code);
    if (room && !room.receiverId) {
      room.receiverId = socket.id;
      socket.join(code);
      socket.emit("room-joined", { success: true });
      // Notify sender that receiver joined
      io.to(room.senderId!).emit("receiver-joined");
      console.log("User joined room:", code);
    } else {
      socket.emit("room-joined", { success: false, error: "Invalid code or room full" });
    }
  });

  socket.on("file-meta", ({ code, meta }) => {
    const room = rooms.get(code);
    if (room && room.senderId === socket.id) {
      room.fileMeta = meta;
      socket.to(code).emit("file-meta", meta);
    }
  });

  socket.on("file-chunk", ({ code, chunk }) => {
    // Relay chunk directly to the other person in the room
    socket.to(code).emit("file-chunk", chunk);
  });

  socket.on("transfer-complete", (code) => {
    socket.to(code).emit("transfer-complete");
  });

  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      const room = rooms.get(roomCode);
      if (room) {
        socket.to(roomCode).emit("peer-disconnected");
        rooms.delete(roomCode);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static("dist"));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
