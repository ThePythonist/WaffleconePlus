const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + "/public"));

io.on("connection", (socket) => {
	console.log(`client ${socket.id} connected`);
	socket.on("disconnect", disconnect);
});

function disconnect() {
	console.log(`client ${this.id} disconnected`);
}

http.listen(port, () => console.log(`listening on port ${port}`));