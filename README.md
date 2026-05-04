Got it — I’ll adjust the README so it reflects your **actual architecture (repositories + services, no domain entities)** and keep it honest but still professional.

Here’s the corrected **extensive README**:

---

# 🔐 Custom Authentication System (NestJS)

A secure, modular, and extensible authentication system built with **NestJS**, using a **repository-based architecture** and a clean service-oriented design.

---

## 🚀 Overview

This project implements a full authentication system supporting:

* 🔑 Email + password authentication
* 🌐 OAuth login (GitHub-ready structure)
* ✉️ Email verification
* 🔁 Password reset flow
* 🍪 Session-based authentication
* 🔒 Secure token handling (hashed tokens)
* 🧱 Repository-based persistence layer
* 🧠 Clean service-oriented architecture

The system is designed to be:

* Secure by default
* Modular and testable
* Easy to extend (Google OAuth, 2FA, etc.)
* Production-ready for real applications

---

## 🧠 Architecture Philosophy

This project follows a **layered service + repository architecture**:

```id="kq9s0w"
Controller → AuthService → Repositories → Database
```

### Key Principles:

* Business logic lives in **services**
* Data access is handled by **repositories**
* Security logic is centralized in utility/services
* Side effects (email, logging) are isolated
* Clear separation between authentication concerns

---

## 🔐 Features

### 👤 Authentication

* Email + password signup
* Secure login with hashed passwords
* OAuth login (GitHub support structure included)

### ✉️ Email System

* Email verification on signup
* Password reset via secure token
* Expiring, single-use tokens

### 🍪 Session Management

* Session creation with metadata (IP + device)
* Session revocation (single + all sessions)
* Long-lived sessions (30 days default)

### 🔒 Security

* Password hashing (bcrypt/argon2 abstraction)
* Token hashing (never store raw tokens)
* Fake delay to reduce timing attacks
* User enumeration protection
* Centralized error handling (`AppError`)

---

## 🔁 Authentication Flows

---

### 🟢 Signup Flow

1. Normalize input (email + name)
2. Check if user exists
3. If OAuth user exists → attach local account
4. Otherwise create new user
5. Create local account (hashed password)
6. Generate verification token
7. Send verification email

---

### 🔵 Signin Flow

1. Find account by email (local provider)
2. If not found → fake delay + error
3. Verify password
4. Load user
5. Create session with metadata
6. Return session + user info

---

### 🔁 Password Reset Flow

1. Generate reset token
2. Store hashed token in DB
3. Send email with token
4. Validate token on reset
5. Hash new password
6. Update account password
7. Mark token as used
8. Revoke all sessions

---

### 🌐 OAuth Flow (GitHub)

1. Find account by provider ID
2. If exists → load user
3. If not:

   * Try linking via email
   * Or create new user
4. Create OAuth account
5. Create session

---

## 🔒 Security Model

### Protected against:

* ❌ User enumeration (uniform errors + fake delay)
* ❌ Password brute force (extensible rate limiting ready)
* ❌ Token replay attacks (hashed + single use)
* ❌ Session hijacking (revocation support)
* ❌ Timing attacks (delayed failures)

---

## ⚙️ Tech Stack

* **NestJS** – backend framework
* **Drizzle** - main ORM
* **TypeScript** – type safety
* **bcrypt/argon2** – password hashing abstraction
* **UAParser.js** – device metadata parsing
* **Custom repositories** – persistence layer
* **Email service** – transactional email delivery
* **Structured logging** – audit and debugging

---

## 📊 Design Decisions

### Why repositories?

* Clean separation from business logic
* Easier DB swaps
* Easier mocking in tests

### Why services are large?

* Services handle full use cases
* Act as orchestration layer
* Keep controllers thin

### Why utility-based crypto?

* Centralized security logic
* Easier to upgrade hashing strategies

---

## 🧪 Testing Strategy

### Unit tests

* AuthService flows
* Token validation logic
* Password verification

### Integration tests

* Signup → verification flow
* Login → session creation
* Password reset lifecycle

### Security tests

* Expired token handling
* Replay attacks
* Invalid login attempts

---

## 🚀 Future Improvements

Planned upgrades:

* 🔐 Rate limiting (login + reset protection)
* 🔑 Refresh token system
* 📱 Device management dashboard
* ⚠️ Suspicious login detection
* 📊 Auth analytics tracking
* 🔁 Session rotation strategy
* ⚡ Redis session caching
* 🌐 Multi-provider OAuth expansion (Google, Discord)
* 🔐 Two-factor authentication (2FA)
* 🧠 Event-based architecture (auth events)

---

## 🧠 Key Takeaway

This system is designed as a:

> **secure, modular authentication backend built for real-world production usage**

It prioritizes:

* security
* maintainability
* extensibility
* clarity over complexity

---