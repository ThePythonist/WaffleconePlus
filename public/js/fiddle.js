const socket = io();
const Peer = require("simple-peer");
const clients = {};
const webcamFPS = 12;
const movieFPS = 60;
const webcamRatio = 4/3;
const movieBounds = [0.5, 0.9, 0.5, 0.8];
const resizeReach = 20;
const icons = {};
const movieData = {};
let room;
let hosting = null;
let movieStream = null;

const barHeight = 10;
const barPadding = 10;
const handleRadius = 10;
const scrubTimeFontSize = 25;

const emoji = ["grin", "laugh", "face with hearts", "heart", "tongue", "kiss", "hug", "wink", "heart eyes", "crazy", "cry", "thumbs up", "gay", "transflag", "frog"];

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
				movie.pause();
				movie.removeAttribute('src');
				if (movie.srcObject) {
					for(let i of movie.srcObject.getTracks()) {
						i.stop();
					}
					movie.srcObject = null;
				}
				movie.src = URL.createObjectURL(file);
				movie.load();
				movie.currentTime = 0;
				movie.pause();

				populateMovieCanvas();
				let canvas = $("#movieCanvas")[0];
				movieData.paused = true;
				movieData.time = 0;
				movieData.duration = 0;
				movie.addEventListener("canplay", streamMovie);
				movie.addEventListener("loadeddata", () => {
					drawMovieFrame(null, canvas, canvas.getContext("2d"), movie.clientWidth / movie.clientHeight);
				});
			} else {
				alert("I can't event play that video. Please get better.");
			}
		});

		navigator.mediaDevices.getUserMedia({video: true, audio:true}).then(stream => {
			bindMoviePane();
			socket.emit("newConnection", room);
			loadImages();
			let myStream = $("#myStream")[0];
			myStream.srcObject = stream;
			myStream.play();
			let myCanvas = $("#myCanvas")[0];

			playVideoOnCanvas(myStream, myCanvas, $("#myMenu")[0]);
			let canvasStream = myCanvas.captureStream(webcamFPS);
			let tracks = canvasStream.getVideoTracks().concat(stream.getAudioTracks());
			let combined = new MediaStream(tracks);
			$("#emojiDiv").empty();
			for (let e of emoji) {
				let button = $("<button type='button'></button>");
				let img = $(`<img class='emoji' src='/img/emoji/${e}.png'></img>`);
				button.append(img);
				button[0].addEventListener("click", function() {
					this.blur();
					socket.emit("spam-emoji", e);
				});
				$("#emojiDiv").append(button);
			}

			$("#spamDiv input")[0].addEventListener("keyup", function(event) {
				if (event.keyCode === 13) {
					spam();
				}
			});

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

			socket.on("movieData", (data) => {
				movieData.paused = data.paused;
				movieData.time = data.time;
				movieData.duration = data.duration;
			});

			socket.on("requestPause", (paused) => {
				if (hosting === null && movieStream !== null) {
					if (paused) {
						$("#movie")[0].pause();
					} else {
						$("#movie")[0].play();
					}
				}
			});

			socket.on("requestScrub", (p) => {
				if (hosting === null && movieStream !== null) {
					let movie = $("#movie")[0];
					movie.currentTime = p * movie.duration;
					let canvas = $("#movieCanvas")[0];
					drawMovieFrame(movie, canvas, canvas.getContext("2d"), video.clientWidth/video.clientHeight);
					sendMovieData();
				}
			});

			socket.on("spam", showSpam);
			socket.on("spam-emoji", showSpamEmoji);

			socket.on("headpat", function(recipient) {
				if (recipient in clients) {
					headpat(recipient);
				}
			});

			socket.on("headpat-me", function() {
				headpat(null);
			})

		});
	}
});

function headpat(peerID) {
	let parent = (peerID === null)? "#myStreamDiv" : `#div-${peerID}`;
	let handDiv = $("<div class='hand'></div>");
	let handImg = $(`<img src='/img/hand.png' width='${$(parent).outerWidth()}px'></img>`);
	handDiv.append(handImg);
	$(parent).append(handDiv);
	headpatFloat(handDiv[0], Date.now(), $(parent).innerHeight());
}

function headpatFloat(element, startTime, videoHeight) {
	let frequency = 0.02;
	let amplitude = 0.25 * videoHeight;
	let count = 5;
	let t = (Date.now()-startTime) * frequency;
	let x = Math.cos(t) * amplitude + 0.15 * videoHeight;
	element.style.marginTop = `-${x}px`;
	if (t <= 2 * count * Math.PI) {
		setTimeout(() => {headpatFloat(element, startTime, videoHeight)}, 1000/60);
	} else {
		element.remove();
	}
}


function showSpam(message) {
	let spamDiv = document.createElement("div");
	spamDiv.classList.add("spam");
	spamDiv.innerText = message;
	document.body.appendChild(spamDiv);
	spamDiv.style.top = "100%";
	spamDiv.style.left = ""+(document.body.clientWidth-spamDiv.clientWidth)/2+"px";
	floatSpam(spamDiv, null, Date.now());
}

function showSpamEmoji(name) {
	let spamDiv = document.createElement("div");
	spamDiv.classList.add("spam");
	let spamImg = document.createElement("img");
	spamImg.src = `/img/emoji/${name}.png`;
	spamDiv.appendChild(spamImg);
	document.body.appendChild(spamDiv);
	spamDiv.style.top = "100%";
	spamDiv.style.left = ""+(document.body.clientWidth-spamDiv.clientWidth)/2+"px";
	floatSpam(spamDiv, null, Date.now());
}

function floatSpam(element, simplexNoise, lastTime) {
	let seed = Date.now();
	let roughness = 0.005;
	let amplitude = 5;
	let speed = 0.5;
	if (!simplexNoise) {
		simplexNoise = openSimplexNoise(seed);
	}
	let top = parseInt(element.style.marginTop);
	if (element.style.marginTop === "") {
		top = 0;
	}
	element.style.marginTop = "" + (top - speed*(seed-lastTime)) + "px";

	let left = parseInt(element.style.marginLeft);
	if (element.style.marginLeft === "") {
		left = 0;
	}
	element.style.marginLeft = "" + (left + simplexNoise.noise2D(0, seed*roughness)*amplitude) + "px";
	if (top > -element.clientHeight-document.body.clientHeight) {
		setTimeout(() => {floatSpam(element, simplexNoise, seed)}, 1000/60);
	} else {
		element.remove();
	}
}

function loadImages() {
	icons["play"] = new Image();
	icons["play"].src = "./img/icons/play.svg";
	icons["pause"] = new Image();
	icons["pause"].src = "./img/icons/pause.svg";
}

function removePeer(peerID) {
	$(`#video-${peerID}`).remove();
	$(`#canvas-${peerID}`).remove();
	$(`#div-${peerID}`).remove();
	if (peerID === hosting) {
		clearMovieSpace();
		hosting = null;
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

	if (hosting !== null || movieStream !== null) {
		let video = $("#movie")[0];

		let ctx = canvas.getContext("2d")
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		drawMovieFrame(null, canvas, ctx, video.clientWidth / video.clientHeight);
		drawMovieFrame(video, canvas, ctx, video.clientWidth / video.clientHeight);
	}

	$(".bottom.pane").hide().show(0);
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
		$(".shrink").addClass("overflow");
		let topPane = $(".top.pane");
		try {
			let maxHeight = topPane.resizable("option", "maxHeight");
			while (webcamPane[0].clientHeight !== webcamPane[0].scrollHeight && topPane.outerHeight() < maxHeight){
				topPane.css({height: topPane.outerHeight()+1});
				bindWebcamPane();
			}
		} catch {

		}
	} else {
		$(".shrink").removeClass("overflow");
		if(webcamPane[0].clientHeight !== webcamPane[0].scrollHeight){
			$(".shrink").addClass("overflow");
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
				if (e.clientX >= pos.left - resizeReach && e.clientX <= pos.right + resizeReach && e.clientY >= pos.top && e.clientY <= pos.bottom) {
					$(this).addClass("show");
				} else {
					$(this).removeClass("show");
				}
			} else {
				if (e.clientY >= pos.top - resizeReach && e.clientY <= pos.bottom + resizeReach && e.clientX >= pos.left && e.clientX <= pos.right) {
					$(this).addClass("show");
				} else {
					$(this).removeClass("show");
				}
			}
		});

		let menu = $("#menuCanvas")[0]
		let movieBox = menu.getBoundingClientRect();
		if (movieBox.left <= e.clientX && e.clientX <= movieBox.right && movieBox.top <= e.clientY && e.clientY <= movieBox.bottom) {
			menuOverlay(e);
		} else {
			menu.getContext("2d").clearRect(0, 0, menu.width, menu.height);
		}
	});
}

function playVideoOnCanvas(video, canvas, menu) {
	let ctx = canvas.getContext("2d");
	video.addEventListener("play", function() {
		let $this = this;
		(function loop() {
			if (!$this.paused && !$this.ended) {
				canvas.width = Math.min(webcamRatio*video.clientHeight, video.clientWidth);
				canvas.height = Math.min(canvas.width / webcamRatio, video.clientHeight);
				menu.style.width = canvas.width;
				menu.style.height = canvas.height;
				let x = (canvas.width - $this.clientWidth)/2;
				let y = (canvas.height - $this.clientHeight)/2;
				ctx.drawImage($this, x, y);
				setTimeout(loop, 1000/webcamFPS);
			}
		})();
	});
}

function menuOverlay(e) {
	if (hosting !== null || movieStream !== null) {
		let canvas = $("#menuCanvas")[0]
		let movieCanvas = $("#movieCanvas")[0];
		canvas.width = movieCanvas.width;
		canvas.height = movieCanvas.height;
		let ctx = canvas.getContext("2d");
		let icon = movieData.paused? icons["play"]: icons["pause"];
		let iconSize = 50;
		ctx.drawImage(icon, (canvas.width-iconSize)/2, (canvas.height-iconSize)/2, iconSize, iconSize);
		let video = $("#movie")[0];

		let movieRatio = video.clientWidth/video.clientHeight;
		let dw = canvas.width;
		let dh = canvas.height;
		if (dw/dh < movieRatio) {
			dh = dw/movieRatio;
		} else {
			dw = dh * movieRatio;
		}

		let w = dw - (2 * barPadding);
		let x = (canvas.width - w)/2;
		let y = Math.min((canvas.height + dh)/2, canvas.height - barHeight);
		ctx.fillStyle = "#FFFFFF";
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.rect(x, y, w, barHeight);
		ctx.fill();
		ctx.stroke();

		let p = movieData.time / movieData.duration;
		ctx.fillStyle = "#34EB8F";
		let filledW = p * w;
		ctx.beginPath();
		ctx.rect(x, y, filledW, barHeight);
		ctx.fill();
		ctx.stroke();

		ctx.font = `${scrubTimeFontSize}px Helvetica`;

		let s = scrubPos(e);
		ctx.textAlign = "center";
		let hoverTextWidth = 0;
		if (s !== null) {
			ctx.lineWidth = 1;
			ctx.fillStyle = "#FFFFFF";
			let hoverText = "*:**:**";
			try {
				hoverText = new Date(s * movieData.duration * 1000).toISOString().substr(11, 8);
			} catch {

			}
			hoverTextWidth = ctx.measureText(hoverText).width;
			ctx.fillText(hoverText, e.offsetX, y+barHeight+scrubTimeFontSize);
			ctx.strokeText(hoverText, e.offsetX, y+barHeight+scrubTimeFontSize);
			ctx.fillStyle = "#34EB8F";
			ctx.lineWidth = 5;
			ctx.beginPath();
			ctx.arc(e.offsetX, y+barHeight/2, handleRadius, 0, 2*Math.PI);
			ctx.fill();
			ctx.stroke();
		}

		ctx.lineWidth = 1;
		ctx.fillStyle = "#FFFFFF";
		let t = "*:**:**";
		try {
			t = new Date(movieData.time * 1000).toISOString().substr(11, 8);
		} catch {

		}
		let textWidth = ctx.measureText(t).width;
		let tx = Math.min(Math.max(x+filledW, textWidth/2), canvas.width-textWidth/2);
		if (s === null || e.offsetX - hoverTextWidth/2 > tx+textWidth/2 || e.offsetX + hoverTextWidth/2 < tx-textWidth/2) {
			ctx.fillText(t, tx, y+barHeight+scrubTimeFontSize);
			ctx.strokeText(t, tx, y+barHeight+scrubTimeFontSize);
		}

		ctx.textAlign = "right";
		t = "*:**:**";
		try {
			t = new Date(movieData.duration * 1000).toISOString().substr(11, 8);
		} catch {

		}
		let endTextWidth = ctx.measureText(t).width;
		if (x+filledW+textWidth/2 < x+w-endTextWidth) {
			if (s === null || e.offsetX + hoverTextWidth/2 < x+w-endTextWidth) {
				ctx.fillText(t, x+w, y+barHeight+scrubTimeFontSize);
				ctx.strokeText(t, x+w, y+barHeight+scrubTimeFontSize);
			}
		}	


	}
}

function scrubPos(e) {
	let video = $("#movie")[0];
	let canvas = $("#menuCanvas")[0];

	let movieRatio = video.clientWidth/video.clientHeight;
	let dw = canvas.width;
	let dh = canvas.height;
	if (dw/dh < movieRatio) {
		dh = dw/movieRatio;
	} else {
		dw = dh * movieRatio;
	}

	let w = dw - (2 * barPadding);
	let x = (canvas.width - w)/2;
	let y = Math.min((canvas.height + dh)/2, canvas.height - barHeight);

	if (x <= e.offsetX && e.offsetX <= x + w && y -barHeight <= e.offsetY && e.offsetY <= y + 2 * barHeight) {
		return (e.offsetX - x)/w;
	} else {
		return null;
	}
}

function menuClick(event) {
	if (hosting !== null) {
		let p = scrubPos(event);
		if (p === null) {
			socket.emit("requestPause", hosting, !movieData.paused);
		} else {
			socket.emit("requestScrub", hosting, p);
		}
	}
}

function myMenuClick(event) {
	let movie = $("#movie")[0];
	let p = scrubPos(event);
	if (p === null) {
		if (movie.paused) {
			movie.play();
		} else {
			movie.pause();
		}
	} else {
		movie.currentTime = movie.duration * p;
	}
}

function sendMovieData() {
	let movie = $("#movie")[0];
	movieData.paused = movie.paused;
	movieData.time = movie.currentTime;
	movieData.duration = movie.duration;
	socket.emit("movieData", movieData);
}

function populateMovieCanvas() {
	let video = $("#movie")[0];
	let canvas = $("#movieCanvas")[0];

	$("#menuCanvas")[0].removeEventListener("click", menuClick);
	$("#menuCanvas")[0].addEventListener("click", menuClick);
	let ctx = canvas.getContext("2d");
	canvas.width = $(".center.pane").innerWidth();
	canvas.height = $(".top.pane").innerHeight();
	video.addEventListener("play", function() {
		let $this = this;
		canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
		(function loop() {
			if (!$this.paused && !$this.ended) {
				drawMovieFrame(video, canvas, ctx, $this.clientWidth/$this.clientHeight);
				setTimeout(loop, 1000/movieFPS);
			}
		})();
	});
}

function drawMovieFrame(video, canvas, ctx, movieRatio) {
	let dw = canvas.width;
	let dh = canvas.height;
	if (dw/dh < movieRatio) {
		dh = dw/movieRatio;
	} else {
		dw = dh * movieRatio;
	}
	let x = (canvas.width - dw)/2;
	let y = (canvas.height - dh)/2;
	if (video === null) {
		ctx.fillStyle = "#000000";
		ctx.fillRect(x, y, dw, dh);
	} else {
		ctx.drawImage(video, x, y, dw, dh);
	}
}

function clearMovieSpace() {
	$("#movie")[0].srcObject = null;
	$("#menuCanvas")[0].removeEventListener("click", menuClick);
	let canvas = $("#movieCanvas")[0];
	canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function removeUpdateEventListeners() {
	let movie = $("#movie")[0];
	movie.removeEventListener("play", sendMovieData);
	movie.removeEventListener("pause", sendMovieData);
	movie.removeEventListener("playing", sendMovieData);
	movie.removeEventListener("timeupdate", sendMovieData);
}

function addUpdateEventListeners() {
	movie.addEventListener("play", sendMovieData);
	movie.addEventListener("pause", sendMovieData);
	movie.addEventListener("playing", sendMovieData);
	movie.addEventListener("timeupdate", sendMovieData);
}

function streamMovie() {
	hosting = null;
	let video = $("#movie")[0];
	video.pause();
	let canvas = $("#movieCanvas")[0];
	video.removeEventListener("canplay", streamMovie);
	$("#menuCanvas")[0].removeEventListener("click", myMenuClick);
	$("#menuCanvas")[0].addEventListener("click", myMenuClick);

	removeUpdateEventListeners();
	addUpdateEventListeners();
	if (movieStream !== null) {
		for (let peerID in clients) {
			try {
				clients[peerID].removeStream(movieStream);
			} catch {

			}
		}
	}
	movieStream = video.captureStream();
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

function spam() {
	let input = $("#spamDiv input")[0];
	let message = input.value;
	input.value = "";
	socket.emit("spam", message);
}


function gotStream(peerID, stream) {
	if ($(`#video-${peerID}`).length === 0) {
		let newStream = $(`<video id='video-${peerID}' class='stream'></video>`);
		newStream[0].srcObject = stream;
		newStream[0].play();

		let parent = $(".bottom.pane");
		parent.append(newStream);

		let newCanvas = $(`<canvas id='canvas-${peerID}' class='streamCanvas'></canvas>`);
		let newMenu = $(`<div id='menu-${peerID}' class='streamMenu'></div>`);

		let label = "<img src='/img/hand.png'></img>";
		let headpatButton = $(`<button type='button' class='menuButton'>${label}</button>`);
		headpatButton[0].addEventListener("click", () => {headpat(peerID); socket.emit("headpat", peerID);});
		newMenu.append(headpatButton);

		let newDiv = $(`<div id='div-${peerID}' class='shrink'></div>`);
		newDiv.append(newCanvas);
		newDiv.append(newMenu);

		parent.append(newDiv);

		playVideoOnCanvas(newStream[0], newCanvas[0], newMenu[0]);
	} else {
		hosting = peerID;
		movieData.paused = true;
		movieData.time = 0;
		movieData.duration = 0;
		if (movieStream !== null) {
			$("#menuCanvas")[0].removeEventListener("click", myMenuClick);
			removeUpdateEventListeners();
			for (let peer in clients) {
				clients[peer].removeStream(movieStream);
			}
			movieStream = null;
		}
		let movie = $("#movie")[0];
		movie.pause();
		movie.removeAttribute('src');
		if (movie.srcObject) {
			for(let i of movie.srcObject.getTracks()) {
				i.stop();
			}
			movie.srcObject = null;
		}
		movie.srcObject = stream;
		movie.load();
		populateMovieCanvas();
		movie.addEventListener("canplay", movie.play);
	}

}