const socket = io();
const Peer = require("simple-peer");
const clients = [];
const webcamFPS = 24;
const webcamRatio = 4/3;
const movieBounds = [0.5, 0.9, 0.5, 0.8];
let room;


socket.on("connect", () => {
	let vars = getParams(window.location.href);
	room = vars["room"];
	if (room === null || room === undefined || !/^[A-za-z0-9-_]+$/.test(room)) {
		document.body.innerText = "Invalid room. Please apologise.";
	} else {
		setupHandles();
		navigator.mediaDevices.getUserMedia({video: true, audio:true}).then(stream => {
			socket.emit("newConnection", room);
			let myStream = $("#myStream")[0];
			myStream.srcObject = stream;
			myStream.play();
			let myCanvas = $("#myCanvas")[0];

			playVideoOnCanvas(myStream, myCanvas);

			let canvasStream = myCanvas.captureStream(webcamFPS);
			let tracks = canvasStream.getVideoTracks().concat(stream.getAudioTracks());
			let combined = new MediaStream(tracks);

			socket.on("peerIDs", (peerIDs) => {
				clients.length = 0;
				for (let i=0; i<peerIDs.length; i++) {
					constructPeer(peerIDs[i], true, combined);
				}
			});

			socket.on("peerSignal", (peerID, data) => {
				if (!(peerID in clients)) {
					constructPeer(peerID, false, combined);
				}
				clients[peerID].signal(data);
			});

			socket.on("peerDisconnected", (peerID) => {
				if (peerID in clients) {
					$(`#video-${peerID}`).remove();
					$(`#canvas-${peerID}`).remove();
				}
			});

		});
	}
});

function bindMoviePane() {
	let topPane = $(".top.pane");
	let centerPane = $(".center.pane");
	let wrapper = $(".wrapper");

	let minMovieHeight = wrapper.outerHeight() * movieBounds[0];
	let maxMovieHeight = wrapper.outerHeight() * movieBounds[1];
	let minMovieWidth = wrapper.outerWidth() * movieBounds[2];
	let maxMovieWidth = wrapper.outerWidth() * movieBounds[3];

	if (topPane.outerHeight() < minMovieHeight) {
		topPane.css({height: minMovieHeight});
	}
	if (topPane.outerHeight() > maxMovieHeight) {
		topPane.css({height: maxMovieHeight});
	}
	if (centerPane.outerWidth() < minMovieWidth) {
		centerPane.css({width: minMovieWidth});
	}
	if (centerPane.outerWidth() > maxMovieWidth) {
		centerPane.css({width: maxMovieWidth});
	}

	try {
		topPane.resizable("option", "minHeight", minMovieHeight);
		topPane.resizable("option", "maxHeight", maxMovieHeight);
		centerPane.resizable("option", "minWidth", minMovieWidth);
		centerPane.resizable("option", "maxWidth", maxMovieWidth);
	} catch {

	}

	bindWebcamPane();
}

function bindWebcamPane() {
	$(".bottom.pane").css({height: $(".wrapper").outerHeight() - $(".top.pane").outerHeight()});
}

function setupHandles() {
	bindMoviePane();
	$("body, html, .wrapper").on("resize", bindMoviePane);
	$(window).on("resize", bindMoviePane);

	$(".center.pane").resizable({
	    handles: "e",
	    minWidth: $(".wrapper").outerWidth()*movieBounds[2],
	    maxWidth: $(".wrapper").outerWidth()*movieBounds[3]
	});
	$(".top.pane").resizable({
		handles: "s",
		minHeight: $(".wrapper").outerHeight()*movieBounds[0],
		maxHeight: $(".wrapper").outerHeight()*movieBounds[1]
	}).on("resize", bindWebcamPane);
}

function playVideoOnCanvas(video, canvas) {
	let ctx = canvas.getContext("2d");
	video.addEventListener("play", function() {
		let $this = this;
		(function loop() {
			if (!$this.paused && !$this.ended) {
				canvas.width = Math.min(webcamRatio*video.clientHeight, video.clientWidth);
				canvas.height = Math.min(canvas.width / webcamRatio, video.clientHeight);
				let x = (canvas.width - $this.clientWidth)/2;
				let y = (canvas.height - $this.clientHeight)/2;
				ctx.drawImage($this, x, y);
				setTimeout(loop, 1000/webcamFPS);
			}
		})();
	});
}

function constructPeer(peerID, initiator, stream) {
	let peer = new Peer({initiator: initiator,
						 stream: stream,
						 trickle: false});
	clients[peerID] = peer;

	peer.on("stream", (stream) => {gotStream(peerID, stream)});
	peer.on("signal", (data) => {
		socket.emit("signal", peerID, data);
	})

	peer.on("close", function () {peerClosed(peerID)});
	peer.on("error", function () {peerClosed(peerID)});
}

function peerClosed (peerID) {
	try {
		clients[peerID].destroy();
		delete clients[peerID];
	} catch {

	}
}

function gotStream(peerID, stream) {
	let newStream = $(`<video id='video-${peerID}' class='stream'></video>`);
	newStream[0].srcObject = stream;
	newStream[0].play();

	let parent = $(".bottom.pane");
	parent.append(newStream);

	let newCanvas = $(`<canvas id='canvas-${peerID}' class='streamCanvas'></canvas>'`);

	parent.append(newCanvas);

	playVideoOnCanvas(newStream[0], newCanvas[0]);

}