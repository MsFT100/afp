# PlayFab Replacement Plan — African Pool Pros

## Overview

Replace PlayFab with a custom backend (Supabase, Firebase, or your own Node.js/Next.js API). The project already has **partial custom API infrastructure** (leaderboard, avatars, account creation) — this plan expands that to cover all PlayFab functionality.

---

## 1. Authentication

### Current PlayFab Usage
| Method | File | Line(s) |
|--------|------|---------|
| `LoginWithCustomID` (Guest) | `PlayFabManager.cs` | 1615-1742 |
| `LoginWithEmailAddress` | `PlayFabManager.cs` | 1454-1516 |
| `LoginWithFacebook` | `PlayFabManager.cs` | 1299-1397 |
| `SendAccountRecoveryEmail` | `PlayFabManager.cs` | 560-581 |
| Custom API → PlayFab login | `PlayFabManager.cs` | 1011-1143 |

### Replacement

Replace all PlayFab login calls with direct calls to your auth provider:

**Supabase:**
```csharp
// Guest login (anonymous)
var session = await supabase.Auth.SignIn(Constants.SupabaseUrl, Constants.SupabaseAnonKey);

// Email/password
var session = await supabase.Auth.SignInWithPassword(email, password);

// Facebook
var session = await supabase.Auth.SignInWithOAuth(Provider.Facebook);

// Sign up (replaces custom API account creation)
var session = await supabase.Auth.SignUp(email, password);

// Password reset
await supabase.Auth.SendPasswordResetEmail(email);
```

**Or self-hosted:**
- `POST /api/auth/register` — email, password, nickname, phone → returns `{ userId, token }`
- `POST /api/auth/login` — email, password → returns `{ userId, token }`
- `POST /api/auth/guest` — returns `{ userId, token }`
- `POST /api/auth/facebook` — facebook access token → returns `{ userId, token }`
- `POST /api/auth/reset-password` — email → sends reset email

### Files to modify
- `PlayFabManager.cs` — All login/register/reset methods
- `StaticStrings.cs` — Replace `PlayFabTitleID` with API base URL / Supabase config
- Remove: `using PlayFab;` and `using PlayFab.ClientModels;`

---

## 2. Player Statistics (Wins / Losses / GamesPlayed / Rank / Trials)

### Current PlayFab Usage
| Method | File | Line(s) |
|--------|------|---------|
| `GetPlayerStatistics` | `PlayFabManager.cs` | 148-180, 222-272, 275-303, 369-410 |
| `UpdatePlayerStatistics` | `PlayFabManager.cs` | 198-219, 242-272, 311-364, 385-410, 1267-1284, 2608-2646 |
| PlayFab leaderboard | `PlayFabManager.cs` | 2608-2646 |

### Replacement

**The leaderboard is already on a custom API** (`LeaderBoardManager.cs` uses `/api/leaderboard-world` and `/api/submit-score`). Expand stats to use custom API calls too.

**New API endpoints:**
- `GET /api/player/:userId/stats` → `{ wins, losses, gamesPlayed, rank, trialsLeft }`
- `POST /api/player/:userId/stats` → `{ wins, losses, gamesPlayed, rank, trialsLeft }`
- `POST /api/player/:userId/stats/increment` → `{ stat: "GamesPlayed" }`

Add a new service class:
```
Assets/8Ball/Scripts/Services/PlayerStatsService.cs
```

### Files to modify
- `PlayFabManager.cs` — Replace all `// #region Statistics` methods with calls to `PlayerStatsService`
- Remove: All PlayFab stat calls, `UpdatePlayerRankBasedOnGamesPlayed()`, `UpdatePlayerGamesPlayed()`, `GetTrials()`, `SetInitialStats()`, `DecreasePracticeTrials()`, `SendLeaderBoard()`

---

## 3. Virtual Currency (Coins)

### Current PlayFab Usage
| Method | File | Line(s) |
|--------|------|---------|
| `AddUserVirtualCurrency` | `PlayFabManager.cs` | 707-722 |
| `SubtractUserVirtualCurrency` | `PlayFabManager.cs` | 739-753 |
| `GetUserInventory` | `PlayFabManager.cs` | 831-854, 1400-1428 |

### Replacement

**New API endpoints:**
- `GET /api/player/:userId/currency` → `{ coins: number }`
- `POST /api/player/:userId/currency/add` → `{ amount: number }` → `{ newBalance: number }`
- `POST /api/player/:userId/currency/subtract` → `{ amount: number }` → `{ newBalance: number }`

Add service class:
```
Assets/8Ball/Scripts/Services/CurrencyService.cs
```

### Files to modify
- `PlayFabManager.cs` — Replace `AddCoinsRequest()`, `RemoveCoinsRequest()`, `OnAddCurrencySuccess()`, `OnSubtractCurrencySuccess()`, `UpdateCoins()`, `GetPlayerDataRequest()` coin fetch
- `WinnerControllerScript.cs` — Line 99: `GameManager.Instance.playfabManager.AddCoinsRequest(prize);`
- Remove: All PlayFab currency references

---

## 4. User Data Storage (Cues, Chats, Avatar, Phone, etc.)

### Current PlayFab Usage
| Method | File | Line(s) |
|--------|------|---------|
| `GetUserData` | `PlayFabManager.cs` | 786-877, 1691-1733, 1797-1811, 2043-2088, 2375-2403, 2453-2484 |
| `UpdateUserData` | `PlayFabManager.cs` | 583-601, 602-625, 627-641, 643-658, 687-705, 1236-1263, 1661-1673, 2675-2688 |
| `GetAccountInfo` | `PlayFabManager.cs` | 857-873 |
| `UpdateUserTitleDisplayName` | `PlayFabManager.cs` | 1149-1159, 1325-1337, 1648-1659, 1704-1715 |
| `GetUserData` / `UpdateUserData` | `settings.cs` | 214-319, 486-488 |
| `UpdateUserData` | `AvatarGallery.cs` | 191-226 |

### Data stored in PlayFab:
- `Cues` — owned cue IDs (e.g. `'0';'1';'3'`)
- `Chats` — owned chat pack IDs
- `UsedCue` — currently selected cue/power/aim/time
- `PlayerName` — display name
- `PlayerAvatarUrl` — avatar URL
- `AvatarId` — avatar index
- `LoggedType` — "Guest", "EmailAccount", "Facebook"
- `PhoneNumber` — phone number
- `refferalCode` — referral/promo code
- `FreeCoinsClaimed` — bool
- `RegistrationPromoRedeemed` — bool
- `Country` — country code
- `Emojis` — emoji pack flag

### Replacement

**New API endpoints:**
- `GET /api/player/:userId/data` → full data object (single endpoint)
- `PUT /api/player/:userId/data` → `{ key: value }` — partial update
- `PUT /api/player/:userId/display-name` → `{ displayName }`
- `POST /api/player/:userId/avatar` → `{ avatarUrl, avatarId }`

Add service class:
```
Assets/8Ball/Scripts/Services/PlayerDataService.cs
```

### Files to modify
- `PlayFabManager.cs` — Replace `GetPlayerDataRequest()`, `SetInitNewAccountData()`, `SetUsedCue()`, `UpdateBoughtCues()`, `UpdateBoughtChats()`, `AddFreeCoins()`, `MarkFreeCoinsAsClaimed()`, `RegisterUserData()`, `CompleteAccountRegistration()`, `UpdateCountryData()`
- `settings.cs` — Replace all `PlayFabClientAPI.GetUserData()` / `PlayFabClientAPI.UpdateUserData()` calls (lines ~214-319, ~486-488)
- `AvatarGallery.cs` — Line 195-212: Replace `UpdateAvatarOnServer()` (it already uses a custom API but sends `playFabId` — change to send `userId` instead)

---

## 5. Friends System

### Current PlayFab Usage
| Method | File | Line(s) |
|--------|------|---------|
| `AddFriend` | `PlayFabAddFriend.cs` | 137-185 |
| `GetFriendsList` | `PlayFabManager.cs` | 1745-1836 |

### Replacement

**New API endpoints:**
- `POST /api/friends/add` → `{ friendUserId }`
- `GET /api/friends/list` → `[{ userId, displayName, avatarUrl, onlineStatus }]`
- `POST /api/friends/remove` → `{ friendUserId }`

Add service class:
```
Assets/8Ball/Scripts/Services/FriendsService.cs
```

### Files to modify
- `PlayFabAddFriend.cs` — Replace `AddFriend()` PlayFab API call
- `PlayFabManager.cs` — Replace `GetPlayfabFriends()` (lines 1745-1836)
- `FacebookFriendsMenu.cs` — May need updates if it references PlayFab friend data

---

## 6. Photon Authentication Token

### Current PlayFab Usage
| Method | File | Line(s) |
|--------|------|---------|
| `GetPhotonAuthenticationToken` | `PlayFabManager.cs` | 1842-1853 |

### Replacement

**Option A (Simplest):** Use Photon AppId authentication directly (no custom auth):
```csharp
PhotonNetwork.AuthValues = new AuthenticationValues(userId);
PhotonNetwork.NickName = userId;
PhotonNetwork.ConnectUsingSettings();
```

**Option B:** Generate your own custom auth token server-side:
- `POST /api/photon/auth-token` → `{ token }`
- Server generates a token using Photon's SDK

**Option C:** Keep PlayFab just for Photon auth (minimal dependency).

### Files to modify
- `PlayFabManager.cs` — `GetPhotonToken()`, `OnPhotonAuthenticationSuccess()` (lines 1842-1884)
- `OnPhotonAuthenticationSuccess` also handles `GetPlayerDataRequest()` and `ConnectToChat()` — move those to after your new auth flow.

---

## 7. Photon Chat (Friend Status & Invitations)

### Current Status
Photon Chat is **not tied to PlayFab** — it uses a separate `PhotonChatID` and custom authentication with the PlayFab auth token passed as a parameter.

### Replacement
- Extract Photon Chat auth from PlayFab token dependency
- Use the user's own `userId` and a simple secret or server-generated token
- The chat logic (`ChallengeFriend`, `OnPrivateMessage`, `OnStatusUpdate`, etc.) stays the same

### Files to modify
- `PlayFabManager.cs` — `ConnectToChat()` (lines 1886-1901): replace `authToken` with your own auth mechanism

---

## 8. Files to Delete

- `Assets/8Ball/Scripts/PlayFabManager.cs` — Replace entirely with a new `AuthManager.cs` + service classes
- `Assets/8Ball/Scripts/PlayFabAddFriend.cs` — Replace with `FriendsService.cs` usage
- `Assets/8Ball/Scripts/PlayFabFriendScript.cs` — Lightweight, may keep but rename
- `Assets/PlayFabSDK/` — Entire folder (can delete after migration)
- `Assets/Plugins/PlayFabShared/` — Entire folder
- `Assets/PlayFabEditorExtensions/` — Entire folder

---

## 9. Files to Create

```
Assets/8Ball/Scripts/Services/
├── AuthService.cs          — Login, register, password reset, token management
├── PlayerStatsService.cs   — Wins, losses, games played, rank, trials
├── CurrencyService.cs      — Coin balance, add/subtract coins
├── PlayerDataService.cs    — User data (cues, chats, avatar, phone, etc.)
└── FriendsService.cs       — Add/remove/list friends

Assets/8Ball/Scripts/Managers/
└── SessionManager.cs       — Store current userId, token, player data in memory
```

---

## 10. Database Schema (for your custom backend)

```sql
-- Users / Auth (handled by Supabase Auth or similar)

-- Player profile
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone_number TEXT,
  avatar_url TEXT DEFAULT '',
  avatar_id INT DEFAULT 0,
  country_code TEXT DEFAULT '',
  coins INT DEFAULT 0,
  owned_cues TEXT DEFAULT ''0'',
  owned_chats TEXT DEFAULT '',
  used_cue TEXT DEFAULT ''0';'0';'0';'0'',
  own_emoji_pack BOOLEAN DEFAULT FALSE,
  free_coins_claimed BOOLEAN DEFAULT FALSE,
  referral_code TEXT DEFAULT '',
  logged_type TEXT DEFAULT 'Guest',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player statistics
CREATE TABLE player_stats (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  games_played INT DEFAULT 0,
  rank INT DEFAULT 1,
  trials_left INT DEFAULT 100,
  score INT DEFAULT 0
);

-- Friends
CREATE TABLE friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id),
  friend_id UUID NOT NULL REFERENCES players(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, friend_id)
);

-- Match history
CREATE TABLE match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES players(id),
  opponent_id UUID REFERENCES players(id),
  winner_id UUID REFERENCES players(id),
  wager INT DEFAULT 0,
  room_name TEXT,
  played_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 11. Summary of All Changes by File

| File | Changes |
|------|---------|
| **PlayFabManager.cs** | **Replace entire file** — extract logic into `AuthService`, `PlayerStatsService`, `CurrencyService`, `PlayerDataService`, `SessionManager`. Remove all PlayFab imports. |
| **PlayFabAddFriend.cs** | Replace `AddFriend()` PlayFab call with custom API call via `FriendsService` |
| **PlayFabFriendScript.cs** | Rename to `FriendListItem.cs`, remove PlayFab references |
| **settings.cs** | Replace `PlayFabClientAPI.GetUserData/UpdateUserData/GetAccountInfo` with `PlayerDataService` calls |
| **AvatarGallery.cs** | Update `playFabId` → `userId` in API calls (field name only) |
| **GameManager.cs** | `playfabManager` → `sessionManager` or similar, `opponentPlayFabID` → `opponentUserId` |
| **WinnerControllerScript.cs** | `playfabManager.AddCoinsRequest(prize)` → `CurrencyService.AddCoins(prize)` |
| **SendGameDetails.cs** | `winnerID = playfabManager.PlayFabId` → `winnerID = SessionManager.UserId` |
| **LeaderBoardManager.cs** | Update `playfabId` → `userId` in payloads (adds to existing API) |
| **StaticStrings.cs** | Remove `PlayFabTitleID`, add `ApiBaseUrl`, `SupabaseUrl`, `SupabaseAnonKey` |
| **PhotonChatListener.cs** / **PhotonChatListener2.cs** | Minor — ensure userId replaces PlayFabId in message content |
| **Multiple other files** (`CueShopController.cs`, `ChatShopController.cs`, `BuyItemControl.cs`, `BuyAvatar.cs`) — check if any reference `playfabManager` directly |

---

## 12. Migration Order (Recommended)

1. **Set up database and API endpoints** (server-side work)
2. **Create service classes** in Unity (`AuthService`, `SessionManager`, etc.)
3. **Replace authentication** — guest, email, Facebook login
4. **Replace user data** — cues, chats, avatar, phone, etc.
5. **Replace currency** — coins add/subtract/fetch
6. **Replace statistics** — wins, losses, games played, trials
7. **Replace friends** — add/list/remove friends
8. **Replace Photon auth** — switch from PlayFab token to direct/custom auth
9. **Delete PlayFab SDK** and remove all `using PlayFab;` imports
10. **Test** every flow: guest, email, Facebook, game match, leaderboard, settings, shop
