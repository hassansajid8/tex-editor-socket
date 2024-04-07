const express = require('express')
const app = express();
const { Server } = require("socket.io");
const http = require("http")
const cors = require("cors")
const { PrismaClient } = require('@prisma/client');

app.use(express.json())
app.use(cors())

const prisma = new PrismaClient();

let updatesCount = 0;
let lastEdit;
const userSocketMap = {}

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "*",
	},
})

function getAllConnectedClient(roomId) {
	return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
		(socketId) => {
			return {
				socketId,
				username: userSocketMap[socketId]?.username,
			}
		}
	)
}

io.on("connection", (socket) => {
  console.log('connection established with id: ' + socket.id);

  socket.on("join", (roomId, username)=>{
	userSocketMap[socket.id] = { username, roomId }
	console.log(username + " joined " + roomId);
	socket.join(roomId)

	const connectedUsers = getAllConnectedClient(roomId)
	io.to(roomId).emit("update users list", connectedUsers)
	io.to(socket.id).emit("join success");
  })

  socket.on('document changed', (value, roomId) => {
	lastEdit = value
	if(lastEdit == value){
		console.log("user typed: " + value);
		socket.broadcast.to(roomId).emit("broadcast change", value);
		updateDatabase(roomId, value)
	}
  })

  socket.on("disconnecting", (msg) => {
	console.log(socket.id + " " + msg);
	const rooms = [...socket.rooms]
		rooms.forEach((roomId) => {
			const clients = getAllConnectedClient(roomId)
			io.to(roomId).emit("update users list", clients)
			clients.forEach(({ socketId }) => {
				io.to(socketId).emit("user disconnected", userSocketMap[socket.id]?.username)
			})
		})

		delete userSocketMap[socket.id]		
		socket.leave()	
  });

  socket.on("caret position", (pos) => {
	console.log(socket.id + " is on " + pos)

  })

  socket.on("caret selected", (startPos, endPos) => {
	console.log(socket.id + " selected " + startPos + " to " + endPos)
  })

  socket.on("title update", async (title, roomId, socket) => {
	console.log('user initiated title update')
	const response = await updateTitle(roomId, title);
	if(response){
		io.to(roomId).emit("new title", response.title)
	}
  })
})

async function updateDatabase(projectId, value){
	const response = await prisma.projects.update({
		where: {
			id: projectId,
		},
		data: {
			body: value,
		},
	})

	if(response){
		console.log("database updated");
	}
}

async function updateTitle(projectId, value, socket){
	const response = await prisma.projects.update({
		where: {
			id: projectId
		},
		data: {
			title: value,
		},
	})

	if(response){
		console.log("title updated")
		return response
	}
	
}


const PORT = process.env.PORT || 4000

app.get("/", (req, res) => {
	res.send("API is running successfully")
})

server.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`)
})