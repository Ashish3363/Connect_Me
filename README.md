# Ashish Kumar — Portfolio

A cinematic, scroll-driven portfolio set against an animated Milky Way
galaxy backdrop — a holographic dashboard, project cards as memories, a
neural-network of skills, and a contact portal that emails me directly.

- **Frontend:** React + Vite + Tailwind + Framer Motion + react-three-fiber
- **Contact form:** [EmailJS](https://www.emailjs.com) (client-side, no backend required)
- **Backend (optional):** FastAPI service, included if you want to handle
  submissions yourself

---

## Project structure

```
portfolio/
├── frontend/                  React + Vite app (the cinematic UI)
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MilkyWay/       Animated galaxy (react-three-fiber)
│   │   │   ├── SolarSystem/    3D solar system (react-three-fiber)
│   │   │   ├── layout/         Nav, Footer, SpaceBackdrop
│   │   │   ├── sections/       Hero, About, CurrentWork, Projects, …
│   │   │   └── ui/             Shared UI bits (SectionHeader)
│   │   ├── data/portfolio.js  Single source of truth for content
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js         Proxies /api → FastAPI on :8000
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── backend/                   FastAPI service (optional)
│   ├── app/
│   │   ├── main.py            App + CORS + router wiring
│   │   ├── config.py          Settings (env-driven)
│   │   ├── schemas.py         Pydantic models
│   │   └── routers/
│   │       └── contact.py     POST /api/contact
│   ├── requirements.txt
│   └── .env.example
│
├── .gitignore
└── README.md
```

---

## Running locally

### 1. Frontend

```powershell
cd frontend
npm install
copy .env.example .env
# edit .env and paste your EmailJS credentials (see "Contact form" below)
npm run dev
```

Vite serves on http://localhost:5173.

### 2. Contact form (EmailJS — no backend required)

The contact form delivers email straight to your inbox via
[EmailJS](https://www.emailjs.com), so the site can be deployed as a
pure static build.

**Setup:**

1. Create a free account at https://www.emailjs.com.
2. **Add an email service** (Email Services → Add New Service) and connect
   the inbox that should receive messages. Note the **Service ID**
   (e.g. `service_xxxxxxx`).
3. **Create an email template** (Email Templates → Create New Template).
   The template must reference these variables, which the form sends:

   | Variable        | Value sent          |
   | --------------- | ------------------- |
   | `{{from_name}}`  | Visitor's name      |
   | `{{from_email}}` | Visitor's email     |
   | `{{message}}`    | The message body    |

   Set the template's **Reply-To** field to `{{from_email}}` so you can
   reply to senders directly. Note the **Template ID** (e.g. `template_xxxxxxx`).
4. Copy your **Public Key** from Account → General.
5. Paste all three into `frontend/.env`:

   ```env
   VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
   VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx
   VITE_EMAILJS_PUBLIC_KEY=your-public-key
   ```

6. Restart `npm run dev` so Vite picks up the new env vars.

If any of the three variables are missing, the form shows a friendly
error asking the visitor to email directly.

> **Note:** These values are exposed in the client bundle by design —
> that's how EmailJS works. To prevent abuse, restrict the public key to
> your domain(s) in the EmailJS dashboard (Account → Security → Allowed
> Origins).

### 3. Backend (optional)

A FastAPI service is included if you ever want to handle submissions
yourself (logging, rate-limiting, your own SMTP, etc.). It is **not
required** for the contact form — EmailJS covers that.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

---

## Editing content

All copy lives in `frontend/src/data/portfolio.js` — profile, education,
projects, experience, skills, achievements. Edit that one file and every
section updates.

---

## Production build

```powershell
cd frontend
npm run build
```

Outputs static assets to `frontend/dist/`. Deploy that folder anywhere
(Netlify, Vercel, GitHub Pages, S3+CloudFront). Set the three
`VITE_EMAILJS_*` env vars in your hosting provider's dashboard so the
contact form works in production — no separate backend needed.

---

## Notes on the 3D backdrop

The fixed backdrop (`SpaceBackdrop`) renders an animated Milky Way galaxy
with continuous forward motion and warp streaks, layered over a faint
grid and a gradient veil that keeps text legible. It's built with
react-three-fiber — there's no heavy GLB model to ship, so the bundle
stays small and the page renders fast everywhere.

If a visitor has `prefers-reduced-motion` set, animations are reduced
automatically (see `index.css`).
