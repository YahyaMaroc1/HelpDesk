// Adds a long sample conversation to one ticket in the dev database: 20 replies that alternate between an agent and
// the customer (agent first, answering the customer's original email), each at least 20 lines long. For trying out
// long threads on the ticket page and summaries of long conversations.
//   bun run conversation:sample <ticketId>            add the replies (refuses if the ticket already has them)
//   bun run conversation:sample <ticketId> --reset    delete the previous sample replies first, then add them again
// The agent is the ticket's assignee, or else the first active user; the customer is the ticket's sender. Replies are
// spread evenly between the newest existing message and now. They're recognised by their Message-IDs (@sample.helpdesk.invalid),
// so --reset never touches real messages.
import { parseArgs } from "node:util";
import { SenderType } from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/lib/prisma.ts";

const { values, positionals } = parseArgs({
  options: { reset: { type: "boolean", default: false } },
  allowPositionals: true,
});
const [ticketId] = positionals;
if (!ticketId) {
  console.error("Usage: bun run conversation:sample <ticketId> [--reset]");
  process.exit(1);
}

const SAMPLE_DOMAIN = "sample.helpdesk.invalid";
const MIN_LINES = 20;

type Names = { customer: string; agent: string };

// The replies in order, agent first. A beginner asks which course to take to become a web developer and is coached
// through their first months of learning.
const replies: ((names: Names) => string)[] = [
  ({ customer, agent }) => `Hi ${customer},

Thanks for reaching out, and welcome! It's great that you want to become a web developer.
No programming experience is completely fine: most of our learners start exactly where you are.
Here's the path I'd recommend, in this order:
1. "HTML & CSS Foundations" (about 4 weeks at 5 hours a week).
2. "JavaScript for Absolute Beginners" (about 6 weeks).
3. "Responsive Web Design in Practice" (about 3 weeks).
4. "Git and GitHub Essentials" (one weekend).
5. "Modern React from Scratch" (about 8 weeks), once you're comfortable with JavaScript.
The first course teaches you how web pages are structured and styled.
You'll build a personal profile page by the end of week two, which is very motivating.
The JavaScript course then makes your pages interactive: forms, buttons, small games.
Don't worry about the full list yet; the first two courses alone will keep you busy for a while.
Everything runs in the browser, so you don't need to install anything to get started.
All five courses are included in the annual plan, or you can buy them one at a time.
If you tell me how many hours a week you can study, I can suggest a schedule.
I can also tell you which projects are worth putting in a portfolio later on.
And if anything in the lessons is unclear, just reply to this email.

Best regards,
${agent}`,

  ({ customer }) => `Hi,

Thank you so much for the detailed answer, this is really helpful!
I can study about 6 to 8 hours a week, mostly in the evenings and on Sunday mornings.
I work full-time in a bakery, so my weekdays start very early.
A few questions before I sign up:
- Is the annual plan cheaper than buying the five courses separately?
- Can I pause the annual plan if I get busy during the holidays?
- Do I need a powerful laptop? Mine is about six years old.
- Is there a deadline for finishing each course?
- Will I get a certificate after each course or only at the end?
I also wanted to ask whether the courses are in English only.
English is my second language; I read it well, but fast videos are sometimes hard.
Are there subtitles, or can I slow the videos down?
One more thing: a friend told me to start with Python instead of HTML.
Is that a bad idea if I want to build websites?
Sorry for all the questions, I just want to make the right choice from the start.
I've wanted to change careers for a long time, and I finally feel ready.
Thanks again for your patience.

Best wishes,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

No need to apologise, these are exactly the right questions to ask!
Let me go through them one by one.
Price: the annual plan is $199, and the five courses bought separately would be $245.
Pausing: you can pause the annual plan once a year for up to 60 days from your account settings.
Laptop: a six-year-old laptop is fine, since everything runs in the browser.
A recent version of Chrome or Firefox is all you need, plus a stable internet connection.
Deadlines: there are none; you can take each course at your own pace.
Certificates: you get one for each course, and a track certificate when you finish all five.
Language: all videos have English subtitles, and most also have Spanish, French and German.
You can slow any video down to 0.75x or 0.5x with the gear icon in the player.
There's also a written transcript under each video, which many learners find easier to follow.
About Python: it's a great first language, but it's mostly used on servers and for data work.
For building websites, HTML, CSS and JavaScript are what browsers understand.
You'll learn programming concepts in JavaScript just as well as in Python.
With 6 to 8 hours a week, I'd plan two weekday evenings and Sunday morning.
For example: Tuesday and Thursday for videos, Sunday for the practice exercises.
That should get you through the first course in about four weeks.
Changing careers takes courage, and having a plan already puts you ahead.

Best regards,
${agent}`,

  ({ customer }) => `Hello again,

I signed up for the annual plan yesterday and started "HTML & CSS Foundations"!
I've finished the first three lessons and I really like the teacher's style.
The transcript under the videos is a lifesaver, thank you for mentioning it.
I have a problem with the exercise at the end of lesson 3, though.
The task is to add a picture of myself to the profile page.
I uploaded my photo to the exercise editor and wrote the img tag like the video shows.
But in the preview there's only a small broken image icon.
Here is what I wrote:
<img src="photo of me.jpg" alt="Me at the beach">
The file is called "photo of me.jpg", I checked it three times.
I also tried with .JPG in capitals, but it didn't help.
Is something wrong with the editor, or did I make a mistake?
I didn't want to skip ahead before fixing it.
Also, the lesson mentions "relative paths" but goes over them quite quickly.
I don't really understand the difference between a relative and an absolute path.
Could you explain it in simple words?
Other than that, everything is going well and I'm studying on schedule.
I even practised during my lunch break today!

Thanks,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

Congratulations on starting, and well done for practising on your lunch break!
You haven't done anything wrong with the img tag itself; the problem is the spaces in the file name.
Spaces in file names often cause trouble on the web, because URLs can't contain them directly.
The easiest fix is to rename the file without spaces, for example "photo-of-me.jpg".
Then upload it again and change the tag to:
<img src="photo-of-me.jpg" alt="Me at the beach">
Using lowercase letters and dashes for file names is a good habit for your whole career.
Now, relative and absolute paths, in simple words:
An absolute path is a full address, like https://example.com/images/cat.jpg.
It works from anywhere, because it includes the website's name.
A relative path is directions from where your page is, like "images/cat.jpg".
It means "look in the images folder next to this page".
Think of it like giving directions to a friend.
An absolute path is the full street address, city and country included.
A relative path is "second door on the left", which only works if you start in the right place.
In your own projects you'll mostly use relative paths for your own files.
Absolute paths are for files on other websites.
Lesson 7 covers folders and paths again with more examples, so it will become clearer.
Good luck with the rest of the profile page!

Best regards,
${agent}`,

  ({ customer }) => `Hi,

Renaming the file worked immediately, thank you!
And the street address comparison finally made paths click for me.
I'm now in week three and we've started CSS layouts.
I'm stuck again, I'm afraid, this time with flexbox.
I'm trying to put three boxes next to each other with the same space between them.
I wrote display: flex on the container, and the boxes are now in a row.
But they're all squeezed together on the left side.
I tried adding margin to each box, but then the last box has extra space on the right.
The video uses justify-content, but when I add it nothing changes.
This is my CSS:
.container { display: flex; }
.box { width: 200px; justify-content: space-between; }
I've watched the lesson twice and I don't see the difference with the teacher's code.
I'm also confused about when to use flexbox and when to use grid.
The next module is about grid, and I'm worried I'll mix them up.
Honestly, this is the first time I've felt a bit discouraged.
The first two weeks felt easy, and now it suddenly seems much harder.
Is it normal to feel like this?

Thanks for your help,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

Yes, it's completely normal, and you're actually right on track.
Almost everyone finds the jump from styling text to building layouts the hardest part of the first course.
Feeling stuck usually means you're learning something genuinely new.
The good news: your code is very close, and the fix is small.
justify-content belongs on the container, not on the boxes.
It tells the container how to share out its free space between its children.
So your CSS should look like this:
.container { display: flex; justify-content: space-between; }
.box { width: 200px; }
With space-between, the first box sits at the left edge, the last at the right, and the gaps are equal.
If you'd also like space at the edges, try space-evenly instead.
A good rule to remember: properties about arranging children go on the parent.
Properties about one item's own size or colour go on the item itself.
As for flexbox or grid:
Flexbox is great for one direction, a row or a column, like a menu or a row of cards.
Grid is great for two directions at once, rows and columns, like a whole page layout or a photo gallery.
Many real pages use both: grid for the page, flexbox inside each section.
There's a free game called Flexbox Froggy that makes this very fun to practise.
Take a short break if you need one; you're doing really well.

Best regards,
${agent}`,

  ({ customer }) => `Hello,

It works! The three boxes are perfectly spaced now.
I also played Flexbox Froggy on Sunday and finished all 24 levels.
It was more fun than I expected, and I think I finally understand the parent and children idea.
I finished "HTML & CSS Foundations" yesterday and got my first certificate.
I printed it and put it on the fridge, my family laughed at me, but I'm proud of it.
I've now started "JavaScript for Absolute Beginners".
The first lessons about variables and strings were fine.
But today we started functions, and I'm confused about return.
In the exercise I wrote a function to add two numbers:
function add(a, b) { console.log(a + b); }
It prints the right answer in the console, so I thought it was correct.
But the automatic checker says "Expected add(2, 3) to return 5, got undefined".
Why undefined if the console clearly shows 5?
I also don't understand why we need return at all if console.log shows the result.
The teacher explains it, but I think I missed something.
Another small question: should I use let or const for my variables?
The course uses both and I don't know when to choose which.
I'm keeping up with my schedule, about 7 hours a week.

Many thanks,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

Congratulations on your first certificate! The fridge is exactly the right place for it.
And finishing all of Flexbox Froggy is impressive.
Your question about return is one of the most important ideas in programming, so it's great you asked.
console.log and return do two very different things.
console.log shows a value on the screen for you, the human, to read.
return hands a value back to the code that called the function, so the program can use it.
Your function shows 5 to you, but gives nothing back, and in JavaScript "nothing" is undefined.
That's why the checker, which is code, sees undefined.
Here's the corrected version:
function add(a, b) { return a + b; }
Now you can use the result elsewhere, for example: const total = add(2, 3) * 10;
With your first version, that line would try to multiply undefined by 10 and give NaN.
Think of a function as a coffee machine.
console.log is the machine showing "coffee ready" on its little screen.
return is the machine actually putting the cup in your hands.
About let and const: use const by default.
Use let only when you know the variable will get a new value later, like a counter in a loop.
That way, when you read code, let warns you "this value changes", which makes bugs easier to spot.
Keep going, functions are the foundation of everything that comes next.

Best regards,
${agent}`,

  ({ customer }) => `Hi,

The coffee machine comparison made me laugh, and it really helped.
I fixed the function and the checker accepted it.
I've now done the first half of the JavaScript course and built a tip calculator.
You type the bill amount and the tip percentage, and it shows the tip and the total.
It works most of the time, but I found a strange bug.
When I enter 50 for the bill and 10 for the tip, the total shows "505" instead of 55.
The tip itself is correct, it shows 5.
This is the line that calculates the total:
const total = billInput.value + tip;
I think it's somehow putting the numbers next to each other instead of adding them.
But I don't understand why, because both are numbers.
I also wanted to ask about something else.
The course says I should start using Git soon, but it sounds complicated.
Is it really necessary for a beginner?
I'm saving my files in a folder on my desktop and it seems fine for now.
Finally, I've started thinking about what I want to build for my portfolio.
I'd love to make a website for the bakery where I work.
My boss said she would actually use it if it's good!
Is that a realistic first project?

Thank you,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

Congratulations on the tip calculator, and you've found a classic JavaScript bug.
Values from input fields are always strings (text), even when the user types a number.
So billInput.value is the text "50", not the number 50.
When you use + with a string, JavaScript joins text instead of adding: "50" + 5 becomes "505".
Your tip is correct because multiplication converts text to numbers automatically, but + doesn't.
The fix is to convert the input to a number first:
const bill = Number(billInput.value);
const total = bill + tip;
It's good practice to do this once, right where you read the input, and use bill everywhere else.
You can also check for invalid input with Number.isNaN(bill) and show a friendly message.
About Git: yes, I'd really encourage you to learn it now rather than later.
It keeps a history of every version of your code, so you can go back when something breaks.
It's also how you'll publish your projects on GitHub, which employers look at.
"Git and GitHub Essentials" only takes a weekend, and you only need about five commands day to day.
A folder on your desktop works until the day your laptop breaks or you delete the wrong file.
The bakery website is a wonderful first project, and very realistic.
A real client, real content and a real deadline make a strong portfolio piece.
I'd start simple: a home page, a menu page with prices, opening hours and a contact page.
You already know enough HTML and CSS to build all of that.
Online ordering can come later, once you've done the React course.

Best regards,
${agent}`,

  ({ customer }) => `Hello,

Number() fixed the calculator, thank you, and I added the check for invalid input too.
I took your advice and did the Git course last weekend.
It was less scary than I thought, and my projects are now on GitHub.
I've started the bakery website and finished the home page and the menu page.
My boss loved the photos I took of the bread, and she's asked me to add a page for cakes.
I've run into two problems, though.
First, the website looks great on my laptop, but on my phone everything is tiny.
The text is so small that you have to zoom in to read anything.
I checked my CSS and the font sizes look normal, 16px for the text.
Second, I want the menu to come from a list in JavaScript instead of writing every item in HTML.
There are about 40 items and the prices change every few months.
I've got an array of objects with name, price and description.
I managed to loop over it with a for loop and console.log each item.
But I don't know how to actually put the items on the page.
Should I use innerHTML? I read online that it can be dangerous.
I'm not sure if I'm trying to do something too advanced for my level.
I'm about two thirds through the JavaScript course now.
I still find it hard sometimes, but I enjoy it more every week.

Best,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

What great progress, and a real client asking for more pages is the best sign there is!
The tiny text on the phone is almost always caused by a missing viewport meta tag.
Without it, phones pretend to be a wide desktop screen and shrink the whole page to fit.
Add this line inside the <head> of every page:
<meta name="viewport" content="width=device-width, initial-scale=1">
Your 16px text will then really be 16px on the phone, and the page will be readable straight away.
After that, use media queries to adjust the layout on small screens, like stacking the menu cards.
The "Responsive Web Design in Practice" course goes into this in detail, so it will be very useful soon.
Building the menu from an array is not too advanced at all; it's exactly what JavaScript is for.
You're right to be careful with innerHTML.
Inserting text you control, like your own menu, is safe.
It becomes dangerous with text other people can type, because it could contain harmful code.
A safe habit is to create elements and set their textContent:
const item = document.createElement("li");
item.textContent = \`\${dish.name} - $\${dish.price}\`;
menuList.appendChild(item);
Put those three lines inside your loop, and every dish appears on the page.
textContent always treats the value as plain text, so it can never run code.
Next, when the prices change, you'll only need to edit the array.

Best regards,
${agent}`,

  ({ customer }) => `Hi,

The viewport tag fixed the phone layout instantly, it felt like magic.
And the menu is now built from the array with createElement and textContent.
My boss changed three prices yesterday and I updated them in two minutes.
I finished the JavaScript course last week and got my second certificate.
I'm now doing "Responsive Web Design in Practice", and it's going faster than I expected.
I'd like to add a contact form to the bakery website for custom cake orders.
The form should have name, email, phone number, the date of the event and a message.
I've built the form in HTML, and I'm using the required attribute on the fields.
But my boss tested it and managed to send an order for a date in the past.
She also typed "tomorrow" in the phone field and it was accepted.
How do I check these things properly?
Also, where does the form actually send the data?
At the moment, clicking Send just reloads the page and nothing happens.
My boss would like to receive the orders by email.
Is that possible without building a whole server?
I don't know anything about servers yet.
I hope I'm not asking too many questions; you've been incredibly helpful.
I've told two friends about the courses and one of them has signed up.

Thanks again,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

You're never asking too many questions, and thank you for recommending us to your friends!
Two certificates in about three months, while working full-time, is a great pace.
For the form, the browser can do a lot of the checking for you with the right input types.
Use type="email" for the email, type="tel" for the phone and type="date" for the event date.
For the date, add a min attribute so past dates can't be chosen, for example min="2026-11-01".
You can set min to today's date with one line of JavaScript when the page loads.
For the phone number, add a pattern, for example pattern="[0-9 +()-]{7,20}".
Also add a title attribute that explains the expected format, which the browser shows on errors.
One important thing: checks in the browser are for convenience, not security.
Anyone can bypass them, so whatever receives the data must check it again.
About sending the form: you don't need to build a server for this.
Services like Formspree or Netlify Forms receive form submissions and email them to you.
You set the form's action to the address they give you, and the orders arrive in your boss's inbox.
Their free plans allow about 50 submissions a month, which should be plenty for cake orders.
They also filter spam and validate the data on their side.
Later, in the backend courses, you'll learn to build this yourself.
For now, using a service is exactly what many professional developers do for small sites.
Remember to add a short thank-you message after the form is sent, so customers know it worked.

Best regards,
${agent}`,

  ({ customer }) => `Hello,

The bakery website is live!
I used Netlify to publish it and Netlify Forms for the orders, like you suggested.
The first real cake order arrived on Saturday, for a 60th birthday.
My boss was so happy that she printed the email and showed it to everyone in the shop.
She's also offered to pay me for maintaining the site, which I never expected.
I've now finished the responsive design course as well.
That means I'm ready for "Modern React from Scratch", but I'm a bit nervous.
Everyone online says React is hard.
Should I learn it right away, or practise more plain JavaScript first?
I sometimes still need to look up how array methods like map and filter work.
I'm also wondering what to do after React.
Is it realistic to look for a junior developer job after finishing this track?
Or do I need a computer science degree?
I'm 34, and sometimes I worry that I'm too old to start a new career.
Most people in the online forums seem to be in their early twenties.
I'd love to hear your honest opinion.
Either way, I'm going to keep learning, I enjoy it far too much to stop now.
Thank you for being part of this journey, you've made a huge difference.

Warm regards,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

A live website with a real paying client: that's a fantastic milestone, congratulations!
Many learners finish the whole track before they have anything like that in their portfolio.
About React: it's a good time to start, as long as you're comfortable with the basics.
Before the course, spend a week or two practising map, filter and arrow functions.
React uses map constantly, for example to turn your array of dishes into a list of components.
The first module of the React course also includes a JavaScript refresher on these topics.
It's normal to look things up; experienced developers check documentation every day too.
Here's an idea: rebuild the bakery menu page in React as your first React project.
You already know exactly how it should look and work, so you can focus on learning React itself.
About jobs: yes, it's realistic, and you don't need a degree for most web developer jobs.
Employers care most about what you can build, so your portfolio matters more than certificates.
I'd aim for three or four solid projects on GitHub, with the bakery site as the star.
Explain the real-world impact, like "the bakery now receives orders online".
Most of our learners who find a first job study for 9 to 15 months at a pace like yours.
And no, 34 is not too old at all.
Many developers change careers in their thirties, forties and later.
Your experience working with customers and deadlines is a real strength in a team.
Plenty of hiring managers value that more than a perfect CV.

Best regards,
${agent}`,

  ({ customer }) => `Hi,

Thank you for such an encouraging reply, I've read it several times.
I spent two weeks practising map and filter and then started the React course.
You were right, rebuilding the bakery menu was the perfect first project.
I now have a Menu component, a Dish component and a filter for cakes, bread and pastries.
I'm stuck on one thing, though.
I added a "favourite" button to each dish, using useState.
When I click it, the heart icon changes, so the state seems to work.
But when I switch the category filter and come back, all the favourites are gone.
I think the state is stored inside each Dish component.
Should I store the favourites somewhere else?
I also get a warning in the console that says:
"Each child in a list should have a unique key prop."
The page still works, so I've been ignoring it, but I'd like to understand it.
I'm using map to show the dishes, like you described.
Finally, I've started looking at junior job postings to see what they ask for.
Many mention TypeScript and testing.
Should I learn those before applying, or can I learn them on the job?
I'm about halfway through the React course.

Best wishes,
${customer}`,

  ({ customer, agent }) => `Hi ${customer},

Your bakery menu in React sounds great, and you've diagnosed the problem correctly.
When a component disappears from the page, React throws away its state.
Switching the filter removes the Dish components that don't match, so their favourites are lost.
The solution is called "lifting state up".
Move the favourites into the Menu component, which stays on the page the whole time.
Store them as a list of dish ids, for example: const [favourites, setFavourites] = useState([]);
Pass two props to each Dish: whether it's a favourite, and a function to toggle it.
That way, the Menu remembers the favourites, and the Dish components only display them.
To keep favourites after a page reload, you can also save the list in localStorage later.
About the key warning: don't ignore it, it can cause strange bugs later.
React uses keys to know which item is which when a list changes.
Without them, it can attach the wrong state to the wrong item after filtering or sorting.
Give each dish a unique id in your array, and use it as the key:
{dishes.map((dish) => <Dish key={dish.id} dish={dish} />)}
Avoid using the array index as the key when the list can be filtered, which is exactly your case.
About TypeScript and testing: you don't need to master them before applying.
But a basic understanding will help you stand out.
After the React course, I'd recommend our short "TypeScript for JavaScript Developers" course.
Then add TypeScript and a few tests to one portfolio project, and mention it on your CV.

Best regards,
${agent}`,

  ({ customer }) => `Hello,

I lifted the state up and the favourites now survive the filter, it works perfectly!
I also added ids to all the dishes, and the key warning is gone.
I even saved the favourites in localStorage, so they stay after a reload.
I finished the React course yesterday, which completes the whole web development track.
I received the track certificate this morning, and I have to admit I cried a little.
Seven months ago I didn't know what HTML was.
Now I have a live website with real customers and three more projects on GitHub.
I've started the TypeScript course you recommended, and I'm converting my tip calculator.
I've also applied to five junior developer positions this week.
One company has already invited me to a first interview next Thursday!
They said they liked the bakery website, especially the online cake orders.
I'm nervous, but also excited.
Do you have any advice for a first technical interview?
They mentioned there might be a small live coding exercise.
I'm worried my mind will go blank with someone watching me.
Whatever happens, I wanted to say thank you.
Your answers kept me going on the days when I wanted to give up.
I couldn't have done this without your help and these courses.

With gratitude,
${customer}`,
];

const ticket = await prisma.ticket.findUnique({
  where: { id: ticketId },
  select: {
    senderEmail: true,
    senderName: true,
    assignedTo: { select: { name: true, email: true } },
  },
});
if (!ticket) {
  console.error(`Ticket ${ticketId} not found.`);
  process.exit(1);
}

const sampleFilter = { ticketId, emailMessageId: { endsWith: `.${ticketId}@${SAMPLE_DOMAIN}` } };
const existing = await prisma.message.count({ where: sampleFilter });
if (existing > 0) {
  if (!values.reset) {
    console.error(`Ticket ${ticketId} already has ${existing} sample replies. Run with --reset to replace them.`);
    process.exit(1);
  }
  const { count } = await prisma.message.deleteMany({ where: sampleFilter });
  console.log(`Deleted ${count} sample replies.`);
}

const agent =
  ticket.assignedTo ??
  (await prisma.user.findFirst({ where: { deletedAt: null }, select: { name: true, email: true }, orderBy: { createdAt: "asc" } }));
if (!agent) {
  console.error("No active user to reply as the agent.");
  process.exit(1);
}
const customerName = ticket.senderName ?? ticket.senderEmail;
const names: Names = { customer: customerName.split(/\s+/)[0]!, agent: agent.name };

// Spread evenly between the newest existing message (read after a --reset deleted the old sample replies) and now.
const now = Date.now();
const latest = (
  await prisma.message.findFirst({ where: { ticketId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
)?.createdAt.getTime() ?? now - 7 * 24 * 60 * 60 * 1000;
const step = (now - latest) / (replies.length + 1);
const messages = replies.map((reply, i) => {
  const body = reply(names);
  const lines = body.split("\n").filter((line) => line.trim()).length;
  if (lines < MIN_LINES) throw new Error(`Reply ${i + 1} has ${lines} lines, fewer than ${MIN_LINES}`);
  const fromAgent = i % 2 === 0;
  return {
    ticketId,
    senderType: fromAgent ? SenderType.AGENT : SenderType.CUSTOMER,
    body,
    senderEmail: fromAgent ? agent.email : ticket.senderEmail,
    senderName: fromAgent ? agent.name : ticket.senderName,
    emailMessageId: `reply-${i + 1}.${ticketId}@${SAMPLE_DOMAIN}`,
    createdAt: new Date(latest + (i + 1) * step),
  };
});

// One transaction, so a failure leaves no half-written conversation. The ticket's updatedAt follows its newest reply.
await prisma.$transaction([
  prisma.message.createMany({ data: messages }),
  prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: messages.at(-1)!.createdAt } }),
]);
console.log(`Added ${messages.length} replies to ticket ${ticketId} (agent: ${agent.name}, customer: ${customerName}).`);

await prisma.$disconnect();
