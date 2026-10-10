// Creates 100 realistic sample tickets in the dev database, for trying out sorting and filtering.
//   bun run tickets:sample            create them (refuses if they already exist)
//   bun run tickets:sample --reset    delete the previous sample tickets first, then create them again
// Statuses, categories (some unclassified), senders, dates (last 90 days) and assignees (active users, some
// unassigned) vary; the data is the same on every run. Sample tickets are recognised by their messages' Message-IDs
// (@sample.helpdesk.invalid), so --reset never touches real tickets.
import { parseArgs } from "node:util";
import { MessageDirection, TicketCategory, TicketStatus } from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/lib/prisma.ts";

const { values } = parseArgs({ options: { reset: { type: "boolean", default: false } } });

const COUNT = 100;
const SAMPLE_DOMAIN = "sample.helpdesk.invalid";
const DAY = 24 * 60 * 60 * 1000;

const { GENERAL_QUESTION: GENERAL, TECHNICAL_QUESTION: TECHNICAL, REFUND_REQUEST: REFUND } = TicketCategory;

// [subject, body, category] for an online-course platform.
const templates: [string, string, TicketCategory][] = [
  ["Can't log in after resetting my password", "I reset my password twice but the login page keeps saying my credentials are wrong. I'm using the same email I signed up with.", TECHNICAL],
  ["Password reset email never arrives", "I've requested a password reset three times in the last hour and nothing has arrived, not even in spam.", TECHNICAL],
  ["Video lessons keep buffering", "Every video in the Python course stops to buffer every 20 seconds. My internet is fine, YouTube and Netflix play without issues.", TECHNICAL],
  ["Course progress reset to 0%", "I was 70% through 'Intro to Data Science' and today it shows 0% and all my completed lessons are unchecked.", TECHNICAL],
  ["Certificate shows the wrong name", "My certificate of completion says 'J. Smith' but my profile name is 'Jennifer Smith'. Can you reissue it?", TECHNICAL],
  ["Quiz won't submit", "When I click Submit on the module 4 quiz nothing happens. I tried Chrome and Firefox.", TECHNICAL],
  ["App crashes on Android when downloading lessons", "The mobile app closes as soon as I try to download a lesson for offline viewing. Pixel 7, latest app version.", TECHNICAL],
  ["Subtitles out of sync", "The English subtitles on the Excel course are about 5 seconds behind the audio from lesson 3 onwards.", TECHNICAL],
  ["Two-factor code not accepted", "I enabled two-factor authentication and now the 6-digit codes from my authenticator app are always rejected.", TECHNICAL],
  ["Can't upload my assignment", "Uploading my project (a 40 MB zip) fails at 99% with 'Something went wrong'.", TECHNICAL],
  ["Dark mode makes code examples unreadable", "In dark mode the code snippets are dark grey on black. Could you fix the contrast?", TECHNICAL],
  ["Charged twice for the same course", "My card was charged $49.99 twice on the same day for 'Advanced JavaScript'. I only bought it once.", REFUND],
  ["Refund for a course I didn't start", "I bought 'UX Design Fundamentals' by mistake last week and haven't opened a single lesson. Can I get a refund?", REFUND],
  ["Cancel my subscription and refund this month", "I forgot to cancel before my annual renewal went through yesterday. Please cancel and refund the renewal.", REFUND],
  ["Course content doesn't match the description", "The description promised hands-on projects with React 19 but the course uses an old version and has no projects. I'd like my money back.", REFUND],
  ["Refund still not received", "You approved my refund 12 days ago but nothing has shown up on my credit card statement yet.", REFUND],
  ["Charged after cancelling my free trial", "I cancelled the free trial on day 5 but was still charged for a full month.", REFUND],
  ["Partial refund for a bundle", "I bought the 3-course bundle but already owned one of the courses. Can I get a refund for that one?", REFUND],
  ["Do you offer team or company plans?", "We're a team of 15 developers. Is there a business plan with central billing and progress reports?", GENERAL],
  ["Is there a student discount?", "I'm a full-time university student. Do you offer any discount for students?", GENERAL],
  ["How long do I have access to a course?", "If I buy a single course, do I keep access forever or does it expire?", GENERAL],
  ["Can I change the email on my account?", "I'm leaving my job and want to move my account from my work email to my personal one.", GENERAL],
  ["Invoice with my company's VAT number", "I need an invoice for my last purchase that includes my company's name and VAT number for expenses.", GENERAL],
  ["Are certificates accredited?", "Are your certificates recognised by employers or any official body?", GENERAL],
  ["When is the next live workshop?", "I saw you run live Q&A workshops. When is the next one for the cloud computing track?", GENERAL],
  ["Gift a course to a friend", "Is it possible to buy a course as a gift and send it to someone else's email?", GENERAL],
  ["Delete my account and data", "Please delete my account and all personal data you hold about me.", GENERAL],
  ["Course recommendation for beginners", "I have no programming experience. Which course should I start with to become a web developer?", GENERAL],
  ["Can I download videos to watch offline on my laptop?", "Offline downloads work on my phone. Is there a way to do it on Windows?", GENERAL],
  ["Payment declined but card works elsewhere", "My Visa card is declined at checkout every time, but it works on other websites.", TECHNICAL],
];

const firstNames = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Mateo", "Sofia", "Yuki", "Amara", "Lucas", "Chloe", "Omar", "Priya", "Daniel", "Fatima", "Hiroshi", "Grace", "Mohammed", "Isabella", "Ethan", "Leila", "Carlos", "Hannah", "Kwame", "Mia", "Arjun", "Zoe", "Ivan", "Nora", "Samuel"];
const lastNames = ["Johnson", "Garcia", "Müller", "Nguyen", "Okafor", "Rossi", "Tanaka", "Haddad", "Kowalski", "Silva", "Brown", "Patel", "Dubois", "Kim", "Andersen", "Moreau", "Ali", "Fischer", "Lopez", "Mensah"];
const emailDomains = ["gmail.com", "outlook.com", "yahoo.com", "proton.me", "icloud.com", "acme-corp.com", "university.edu"];

// Small seeded PRNG (mulberry32), so every run creates the same tickets.
let seed = 20261010;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

const sampleFilter = { messages: { some: { emailMessageId: { endsWith: `@${SAMPLE_DOMAIN}` } } } };
const existing = await prisma.ticket.count({ where: sampleFilter });
if (existing > 0) {
  if (!values.reset) {
    console.error(`${existing} sample tickets already exist. Run with --reset to replace them.`);
    process.exit(1);
  }
  const { count } = await prisma.ticket.deleteMany({ where: sampleFilter });
  console.log(`Deleted ${count} sample tickets.`);
}

const agents = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true } });
const now = Date.now();

for (let i = 0; i < COUNT; i++) {
  const [subject, body, templateCategory] = templates[i % templates.length]!;
  const first = pick(firstNames);
  const last = pick(lastNames);
  const senderEmail = `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "") + `@${pick(emailDomains)}`;
  // Some senders only give their address.
  const senderName = random() < 0.2 ? null : `${first} ${last}`;

  const ageDays = random() * 90;
  const createdAt = new Date(now - ageDays * DAY);
  // Older tickets are more likely to be resolved or closed.
  const roll = random() + ageDays / 120;
  const status = roll < 0.75 ? TicketStatus.OPEN : roll < 1.25 ? TicketStatus.RESOLVED : TicketStatus.CLOSED;
  // New tickets may not be classified yet.
  const category = random() < 0.15 ? null : templateCategory;
  // Open tickets are more often still unassigned.
  const unassigned = agents.length === 0 || random() < (status === TicketStatus.OPEN ? 0.4 : 0.1);
  const agent = unassigned ? null : pick(agents);
  const repliedAt = new Date(Math.min(now, createdAt.getTime() + (1 + random() * 47) * 60 * 60 * 1000));

  await prisma.ticket.create({
    data: {
      subject,
      senderEmail,
      senderName,
      status,
      category,
      assignedToId: agent?.id ?? null,
      createdAt,
      updatedAt: status === TicketStatus.OPEN ? createdAt : repliedAt,
      messages: {
        create: [
          {
            direction: MessageDirection.INBOUND,
            body: `Hi,\n\n${body}\n\nThanks,\n${senderName ?? senderEmail}`,
            senderEmail,
            senderName,
            emailMessageId: `sample-${i + 1}-in@${SAMPLE_DOMAIN}`,
            createdAt,
          },
          // Resolved and closed tickets got an answer from their agent.
          ...(agent && status !== TicketStatus.OPEN
            ? [
                {
                  direction: MessageDirection.OUTBOUND,
                  body: `Hi ${senderName?.split(" ")[0] ?? "there"},\n\nThanks for reaching out. We've looked into this and it should be sorted now. Let us know if anything else comes up.\n\nBest,\n${agent.name}`,
                  senderEmail: agent.email,
                  senderName: agent.name,
                  emailMessageId: `sample-${i + 1}-out@${SAMPLE_DOMAIN}`,
                  createdAt: repliedAt,
                },
              ]
            : []),
        ],
      },
    },
  });
}

const counts = await prisma.ticket.groupBy({ by: ["status"], where: sampleFilter, _count: true });
console.log(`Created ${COUNT} sample tickets:`, Object.fromEntries(counts.map((c) => [c.status, c._count])));
await prisma.$disconnect();
