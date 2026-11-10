const http = require("http");
const app = require("./app");
const { initSocket } = require("./src/config/socket.config");

const PORT = process.env.PORT || 3000;

// Create HTTP server wrapping Express
const httpServer = http.createServer(app);

// Initialize WebSockets on the same server
initSocket(httpServer);

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});