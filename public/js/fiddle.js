const socket = io();
const Peer = require("simple-peer");
const clients = [];
let room;


socket.on("connect", () => {
	let vars = getParams(window.location.href);
	room = vars["room"];
	if (room === null || room === undefined || !/^[A-za-z0-9-_]+$/.test(room)) {
		document.body.innerText = "Invalid room. Please apologise.";
	} else {
		navigator.mediaDevices.getUserMedia({video: true, audio:true}).then(stream => {
			socket.emit("newConnection", room);
			let myStream = $("#myStream")[0];
			myStream.srcObject = stream;
			myStream.play();

			socket.on("peerIDs", (peerIDs) => {
				clients.length = 0;
				for (let i=0; i<peerIDs.length; i++) {
					constructPeer(peerIDs[i], true, stream);
				}
			});

			socket.on("peerSignal", (peerID, data) => {
				if (!(peerID in clients)) {
					constructPeer(peerID, false, stream);
				}
				clients[peerID].signal(data);
			})

		});
	}
});

function constructPeer(peerID, initiator, stream) {
	let peer = new Peer({initiator: initiator,
						 stream: stream,
						 trickle: false});
	clients[peerID] = peer;

	peer.on("stream", gotStream);
	peer.on("signal", (data) => {
		socket.emit("signal", peerID, data);
	})
}

function gotStream(stream) {
	let newStream = $("<video class='stream' muted></video>");
	newStream[0].srcObject = stream;
	newStream[0].play();
	$("body").append(newStream);
}