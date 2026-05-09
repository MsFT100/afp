# Matchmaking System Documentation

## 🎯 Goal
Match players into game sessions based on:
- skill/rank
- availability
- latency (optional)

---

## 🧠 Core Concept

Players enter a queue → system finds suitable opponent → match is created → players join game (Photon)

---

## 📦 Data Model
MatchQueue

playerId
rank
joinedAt

Match

id
player1Id
player2Id
roomId
status (WAITING | ACTIVE | FINISHED)
createdAt