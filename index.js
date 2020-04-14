const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + "/public"));

io.on("connection", (socket) => {
	console.log(`client ${socket.id} connected`);
	socket.on("disconnect", disconnect);

	socket.on("newConnection", function (room) {
		console.log(`client ${this.id} joined room ${room}`);
		this.join(room);
		this.room = room;
		let peerIDs = [];
		for (let s in io.sockets.adapter.rooms[room].sockets) {
			if (s !== this.id) {
				peerIDs.push(s);
			}
		}
		this.emit("peerIDs", peerIDs);
	});

	socket.on("signal", function (socketID, data) {
		console.log(`client ${this.id} is sending a signal to client ${socketID}`);
		io.to(socketID).emit("peerSignal", this.id, data);
	});

	socket.on("movieData", function(movieData) {
		socket.broadcast.to(this.room).emit("movieData", movieData);
	});

	socket.on("requestPause", function(hosting, paused) {
		io.to(hosting).emit("requestPause", paused);
		console.log(`client ${this.id} requested that client ${hosting} pause the movie`);
	})
});

function disconnect() {
	console.log(`client ${this.id} disconnected`);
	io.sockets.in(this.room).emit("peerDisconnected", this.id);
}

http.listen(port, () => console.log(`listening on port ${port}`));