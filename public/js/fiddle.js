const socket = io();
const Peer = require("simple-peer");
const clients = {};
const webcamFPS = 24;
const movieFPS = 24;
const webcamRatio = 4/3;
const movieBounds = [0.5, 0.9, 0.5, 0.8];
const resizeReach = 20;
let room;
let hosting = null;
let movieStream = null;


socket.on("connect", () => {
	let vars = getParams(window.location.href);
	room = vars["room"];
	if (room === null || room === undefined || !/^[A-za-z0-9-_]+$/.test(room)) {
		document.body.innerText = "Invalid room. Please apologise.";
	} else {
		setupHandles();
		$("#movieSelector")[0].addEventListener("change", function(e) {
			let file = this.files[0];
			let movie = $("#movie")[0];
			if (movie.canPlayType(file.type) !== "") {
				movie.src = URL.createObjectURL(file);
				populateMovieCanvas();
				movie.play();
				streamMovie();
			} else {
				alert("I can't event play that video. Please get better.");
			}
		});

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
				for (let peerID in clients) {
					removePeer(peerID);
					delete clients[peerID];
				}
				for (let i=0; i<peerIDs.length; i++) {
					constructPeer(peerIDs[i], true, combined);
				}
			});

			socket.on("peerSignal", (peerID, data) => {
				if (!(peerID in clients)) {
					constructPeer(peerID, false, combined);
					if (movieStream !== null) {
						clients[peerID].addStream(movieStream);
					}
				}
				clients[peerID].signal(data);
			});

			socket.on("peerDisconnected", (peerID) => {
				if (peerID in clients) {
					removePeer(peerID);
				}
			});

		});
	}
});

function removePeer(peerID) {
	$(`#video-${peerID}`).remove();
	$(`#canvas-${peerID}`).remove();
	if (peerID === hosting) {
		clearMovieSpace();
	}
	peerClosed(peerID);
}


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

	equalizeLeftRightPanes();
	bindWebcamPane();
	mindWebcamPlacement();


	let canvas = $("#movieCanvas")[0];
	canvas.width = centerPane.innerWidth();
	canvas.height = topPane.innerHeight();
}

function equalizeLeftRightPanes() {
	let leftPane = $(".left.pane");
	let rightPane = $(".right.pane");
	let newWidth = (leftPane.outerWidth() + rightPane.outerWidth())/2;
	leftPane.css({width: newWidth});
	rightPane.css({width: newWidth});
}

function bindWebcamPane() {
	$(".bottom.pane").css({height: $(".wrapper").innerHeight() - $(".top.pane").innerHeight()});
}

function mindWebcamPlacement() {
	let webcamPane = $(".bottom.pane");
	if(webcamPane[0].clientHeight !== webcamPane[0].scrollHeight){
		$(".streamCanvas").addClass("overflow");
		let topPane = $(".top.pane");
		let maxHeight = topPane.resizable("option", "maxHeight");
		while (webcamPane[0].clientHeight !== webcamPane[0].scrollHeight && topPane.outerHeight() < maxHeight){
			topPane.css({height: topPane.outerHeight()+1});
			bindWebcamPane();
		}
	} else {
		$(".streamCanvas").removeClass("overflow");
		if(webcamPane[0].clientHeight !== webcamPane[0].scrollHeight){
			$(".streamCanvas").addClass("overflow");
		}
	}
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

	$("body")[0].addEventListener("mousemove", function(e) {
		let handles = $(".ui-resizable-handle").each(function (index) {
			let pos = this.getBoundingClientRect();
			if ($(this).hasClass("ui-resizable-e") || $(this).hasClass("ui-resizable-w")) {
				if (e.clientX >= pos.left - resizeReach && e.clientX <= pos.right + resizeReach) {
					$(this).addClass("show");
				} else {
					$(this).removeClass("show");
				}
			} else {
				if (e.clientY >= pos.top - resizeReach && e.clientY <= pos.bottom + resizeReach) {
					$(this).addClass("show");
				} else {
					$(this).removeClass("show");
				}
			}
		});		
	});
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

function populateMovieCanvas() {
	let video = $("#movie")[0];
	let canvas = $("#movieCanvas")[0];
	let ctx = canvas.getContext("2d");
	let movieRatio = video.clientWidth / video.clientHeight;
	canvas.width = $(".center.pane").innerWidth();
	canvas.height = $(".top.pane").innerHeight();
	video.addEventListener("play", function() {
		let $this = this;
		(function loop() {
			if (!$this.paused && !$this.ended) {
				let dw = canvas.width;
				let dh = canvas.height;
				if (dw/dh < movieRatio) {
					dh = dw/movieRatio;
				} else {
					dw = dh * movieRatio;
				}
				let x = (canvas.width - dw)/2;
				let y = (canvas.height - dh)/2;
				ctx.drawImage($this, x, y, dw, dh);
				setTimeout(loop, 1000/movieFPS);
			}
		})();
	});
}

function clearMovieSpace() {
	$("#movie")[0].srcObject = null;
	let canvas = $("#movieCanvas")[0];
	canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function streamMovie() {
	hosting = null;
	let video = $("#movie")[0];
	let canvas = $("#movieCanvas")[0];
	let canvasStream = canvas.captureStream(movieFPS);
	let tracks = canvasStream.getVideoTracks().concat(video.captureStream().getAudioTracks());
	if (movieStream !== null) {
		for (let peerID in clients) {
			clients[peerID].removeStream(movieStream);
		}
	}
	movieStream = new MediaStream(tracks);
	for (let peerID in clients) {
		clients[peerID].addStream(movieStream);
	}
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
	if ($(`#video-${peerID}`).length === 0) {
		let newStream = $(`<video id='video-${peerID}' class='stream'></video>`);
		newStream[0].srcObject = stream;
		newStream[0].play();

		let parent = $(".bottom.pane");
		parent.append(newStream);

		let newCanvas = $(`<canvas id='canvas-${peerID}' class='streamCanvas'></canvas>'`);

		parent.append(newCanvas);

		playVideoOnCanvas(newStream[0], newCanvas[0]);
	} else {
		hosting = peerID;
		if (movieStream !== null) {
			for (let peer in clients) {
				clients[peer].removeStream(movieStream);
			}
			movieStream = null;
		}
		let movie = $("#movie")[0];
		movie.srcObject = stream;
		populateMovieCanvas();
		movie.play();
	}

}