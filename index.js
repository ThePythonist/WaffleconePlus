const express = require("express");
const rateLimit = require("express-rate-limit");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100
});
const port = process.env.PORT || 3000;

const roomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const roomIDLength = 50;
const tries = 1000;

app.use(limiter);
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
	});

	socket.on("requestScrub", function(hosting, p) {
		io.to(hosting).emit("requestScrub", p);
		console.log(`client ${this.id} requested that client ${hosting} scrub to p=${p}`);
	});

	socket.on("spam", function(data) {
		io.sockets.in(this.room).emit("spam", data);
	});

	socket.on("spam-emoji", function(data) {
		io.sockets.in(this.room).emit("spam-emoji", data);
	});

	socket.on("headpat", function(recipient) {
		socket.broadcast.to(this.room).emit("headpat", recipient);
		io.to(recipient).emit("headpat-me");
	});

	socket.on("dance", function() {
		socket.broadcast.to(this.room).emit("dance", this.id);
	});

	socket.on("stopdance", function() {
		socket.broadcast.to(this.room).emit("stopdance", this.id);
	});

	socket.on("createRoom", function() {
		let roomID = randomString(roomIDLength);
		let room = io.sockets.adapter.rooms[roomID];
		let attempts = 0;
		while (attempts < tries && room !== undefined && room.length > 0) {
			roomID = randomString(roomIDLength);
			room = io.sockets.adapter.rooms[roomID];
			attempts ++;
		}
		if (attempts >= tries) {
			socket.emit("noRoom");
		} else {
			socket.emit("randomRoom", roomID);
		}
	});

});

function randomString(length) {
	let string = "";
	for (let i=0; i<length; i++) {
		let index = Math.floor(Math.random() * roomChars.length);
		string += roomChars[index];
	}
	return string;
}

function disconnect() {
	console.log(`client ${this.id} disconnected`);
	io.sockets.in(this.room).emit("peerDisconnected", this.id);
}

http.listen(port, () => console.log(`listening on port ${port}`));