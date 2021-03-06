function socket(server) {
  const { Server } = require("socket.io")

  // Import utility functions
  const { newHands } = require("./assets/utils.js")

  // create IO object, allow all CORS requests
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  })

  // Initialise global users array
  let users = []

  // Pre-connection checks for username
  io.use((socket, next) => {
    const id = socket.handshake.auth.id
    const username = socket.handshake.auth.username

    if (!id || !username) return next(new Error("invalid credentials"))

    socket.userID = id
    socket.username = username

    next()
  })

  io.on("connection", (socket) => {
    handleNewUser(socket)

    // Add listeners
    socket.on("action", fowardAction)
    socket.on("challenge", challenge)
    socket.on("accept", accept)
    socket.on("play", play)
    socket.on("emoji", emoji)
    socket.on("disconnect", userDisconnected)

    // Forward various messages to another user. i.e. Used for declining, resigning etc.
    function fowardAction(action, id, callback) {
      const opponent = findUser(id)
      if (!opponent) {
        if (callback) callback("error")
        return
      }

      socket.to(opponent.socketID).emit(action)
      if (callback) callback("success")
    }

    // Challenge the player with ID, apply the callback function to the challenger
    function challenge(id, callback) {
      const opponent = findUser(id)
      if (!opponent) {
        callback({
          header: "Error",
          body: "User is offline. Please try again.",
        })
        return
      }

      socket
        .to(opponent.socketID)
        .emit("challenge", socket.userID, socket.username)
      callback({
        header: "Success",
        body: "Challenge sent",
      })
    }

    // Accept the challenge from player ID, apply the callback function to the acceptor
    function accept(id, callback) {
      const opponent = findUser(id)
      if (!opponent) return

      // Create the hands to play, and determine who goes first (player with lowest ranked card)
      const hands = newHands(13)
      const first = hands[0][0].value < hands[1][0].value ? 1 : 2

      // Emit game object to our opponent, with initial state
      socket
        .to(opponent.socketID)
        .emit("accepted", createGameObject(1, hands, first, socket))

      // Callback to user with their game object
      callback(createGameObject(2, hands, first, opponent))
    }

    // Simple function to create a game object for a given player
    // Args: player number, hands object, player who goes first, opponent object (could be socket or user)
    function createGameObject(player, hands, first, opponent) {
      return {
        hand: hands[player - 1],
        playerNumber: player,
        activePlayer: first,
        opponent: {
          id: opponent.userID,
          name: opponent.username,
          passed: false,
          score: 0,
          cards: 13,
        },
      }
    }

    // Inform our opponent of our played hand
    function play(hand, id, callback) {
      const opponent = findUser(id)
      if (!opponent) {
        callback("offline")
        return
      }
      socket.to(opponent.socketID).emit("play", hand)
      callback("success")
    }

    // Emit the emoji to our opponent
    function emoji(emoji, id) {
      const opponent = findUser(id)
      if (!opponent) return

      socket.to(opponent.socketID).emit("emoji", emoji)
    }

    // If user disconnects, remove them from the global users array
    function userDisconnected() {
      users = users.filter((user) => user.socketID !== socket.id)
    }
  }) // End of "on Connection" functions

  // Utility function to add new user to global list and emit to others
  function handleNewUser(socket) {
    // Add newly connected user to users list
    users.push({
      socketID: socket.id,
      userID: socket.userID,
      username: socket.username,
    })

    // Emit list to newly connected user
    socket.emit("users", users)

    // tell everyone else we are here
    socket.broadcast.emit("user connected", {
      userID: socket.userID,
      username: socket.username,
    })
  }

  // Utility function to find a user from the global list of users
  function findUser(id) {
    return users.find((user) => user.userID === id)
  }
}
module.exports = socket
