# Demo call transcript — Ridgeline Recruitment (FICTIONAL)

> Teaching material for AI class demos. All names, companies, and products in
> this transcript are fictional. Any resemblance to real companies or people is
> coincidental. Structure mirrors a real discovery call: intro banter, company
> context, tech migration, AI platform discussion, engagement models, next steps.
>
> Demo flow: paste this transcript to Claude with a prompt like —
> "Here is my latest call with Ridgeline Recruitment. Find them in the system,
> update the CRM, create a proposal from the template, and move the deal to
> proposal." (Pre-seed Ridgeline + Gordon Blake in the demo CRM first.)

---

[Speaker 1 - 0:00]
[keyboard clacking] Hi, how are you going?

[Speaker 2 - 0:12]
Pretty good. How are you doing?

[Speaker 1 - 0:15]
Good, good. Bear with me one second, mate, I've just got to fire off one email before we start. Big contractual thing, they need it this morning.

[Speaker 2 - 0:24]
No worries. So you're an early bird, huh? What time is it there?

[Speaker 1 - 0:29]
It's only 8:30. I'm in Brisbane. Work from home Tuesdays, so I started early. Excuse the look, I've got appointments around the corner later.

[Speaker 2 - 0:38]
[laughs] All good.

[Speaker 3 - 0:52]
Morning, gents. Sorry, had trouble with the link.

[Speaker 1 - 0:55]
There he is.

[Speaker 3 - 0:57]
How are you, Dave? Good to finally meet you.

[Speaker 2 - 1:00]
Likewise. It's been a good week. I'm back in the US at the moment, Philadelphia, wrapping up a workshop. But I live in Vietnam these days, Saigon.

[Speaker 3 - 1:09]
Oh, Vietnam. How's that?

[Speaker 2 - 1:11]
It's pretty awesome, honestly. Been there about eighteen years now. My business entity is out of Seattle, a lot of my customers are US and Australia, but the engineering team is all in Saigon.

[Speaker 1 - 1:22]
My daughter did three weeks in Vietnam last year. Hoi An, Hanoi, the lot. Hasn't shut up about the food since.

[Speaker 2 - 1:28]
[laughs] That's the correct response. Nobody comes back complaining about the food.

[Speaker 1 - 1:33]
And how'd you find the World Cup over there in the States? We stayed up for most of it.

[Speaker 2 - 1:38]
Oh man, it was chaos. I'm in Philadelphia right now and they had matches here a few weeks back. Hotel prices doubled. I'm like, I don't even watch soccer... football. I try to use the right word. [laughs]

[Speaker 1 - 1:49]
[laughs] You were doing so well, mate.

[Speaker 3 - 1:52]
Righto, we should probably get on with it. Dave, what time is it for you?

[Speaker 2 - 1:56]
It's 8:30 at night, so we're on a perfect twelve-hour flip.

[Speaker 1 - 2:01]
Okay, look, so you've come to us through Stefan. He's a consultant we've worked with over a number of years. And Mick here, Mick Torrens, he's in the same sort of boat, a consultant helping us manage this tech stack rollout, which has been an absolute calamity, to be honest.

[Speaker 2 - 2:16]
[chuckles]

[Speaker 1 - 2:17]
Stefan just said, look, this guy's got a real capability, he's been working with a few Australian clients, you should have a chat and see if there's something in it. That's about all I know, except he talked you up a fair bit.

[Speaker 2 - 2:28]
[laughs] Appreciate that.

[Speaker 1 - 2:30]
I'll mostly listen here, because Mick's going to be the one running this thing. Mick, do you want to give Dave the rundown?

[Speaker 3 - 2:37]
Yeah, so quick picture of where we're at. Ridgeline's an eighteen-seat recruitment company, permanent and contract placements, mostly contract. We've got about three hundred and twenty tradespeople and engineers under contract at any one time. Mostly Queensland, some New South Wales, focused on civil construction and mining services. Been around twenty years, so well and truly established.

[Speaker 2 - 2:58]
Mm-hmm.

[Speaker 3 - 2:59]
The nightmare is the system. We're on RecruitPro, which is our CRM and ATS, applicant tracking system. It's a remote desktop product. Gordon actually bought the licenses outright a couple of years back, so we own them, but the vendor's moved everything to the cloud and our version is now completely unsupported. We've got a bloke basically full-time keeping it alive and customizing it. It's clunky, it's slow, and it's never getting another update.

[Speaker 2 - 3:22]
Right.

[Speaker 3 - 3:23]
So we're migrating. What we're most likely going with is Atlas CRM, which is built on a Microsoft stack. Final negotiation now, we should have it signed in the next week or two, and then go live is probably November, possibly slipping to February depending on timelines.

[Speaker 1 - 3:38]
And to be clear, both of them are clunky. We're going from one clunky thing to a slightly less clunky thing with a good API.

[Speaker 3 - 3:45]
That's the honest version, yeah. Atlas is robust, good API, solid schema, excellent LinkedIn and Office integrations. But the UI is ordinary and it's missing basically all the AI functionality we actually want. These big Microsoft-stack products never keep up anyway.

[Speaker 2 - 3:59]
Sure.

[Speaker 3 - 4:00]
So in parallel, and this was Gordon's idea, which I think is a good one, we want to build a sort of AI dashboard. A dashboard with real AI functionality baked in. Initially probably working off the RecruitPro database, depending on the quality of the API, which we haven't verified yet. It's locally built, so who knows what we'll find.

[Speaker 1 - 4:17]
Just to clarify, yes, dashboarding, but really it's about integrated workflows. What did we end up calling them, Mick?

[Speaker 3 - 4:24]
Guided workflows.

[Speaker 1 - 4:25]
Guided workflows. Where the system pulls you through the process rather than you clicking around eleven screens. We don't want to just look at data differently, we want to actually work differently.

[Speaker 3 - 4:35]
So the shape of it is: one, some standalone tools, CV filtering and that kind of thing. Two, replicating some of the actual workflows that exist in the CRM and ATS but reimagined, better UI, more intuitive, with the AI doing the heavy lifting. Early next week we're putting a day aside to document every workflow and task in the business and map what we think the optimal versions look like. Then we gap-analyse Atlas, figure out what it genuinely can't do, and from that build a priority list of features and workflows for this dashboard. Ideally we'd have something up and running in six to eight weeks, and then it just becomes an ongoing development piece.

[Speaker 2 - 5:08]
Okay.

[Speaker 3 - 5:09]
Now, I've got a fair bit of tech background. My last company, I'm technically still CEO of it, we built a large-scale data system, React front end, .NET back end, and it was great. But I'm not a coder. I can use Claude like everyone else these days, but that doesn't make me a coder. So we're looking for someone to either collaborate with or handle the build of the initial dashboard shell, Next.js or React or whatever you'd recommend, and then help build out the apps and workflows. We'll probably handle most of the workflow thinking in-house, the grungy process stuff. We need someone to execute, and to advise on architecture so it's robust and future-proof.

[Speaker 1 - 5:41]
And whether we should even be talking. Are we aligned, or is Stefan getting something out of this? [laughs]

[Speaker 2 - 5:47]
[laughs] Fair question. So, the way I think about the world these days: every successful company going forward is going to have a centralized database and a smart information architecture. Not just the database, the documents, everything that makes up the information of the company. A lot of people think they can just turn AI on, but AI has no access to the information it needs to do anything useful. That's problem number one.

[Speaker 3 - 6:08]
Yeah.

[Speaker 2 - 6:09]
And I hear you talking about workflows a lot, which is interesting, because Stanford just put out a study across about fifty companies, and in the successful AI programs, 77% of the work is not AI. It's everything else you just described. Data, process, workflow.

[Speaker 3 - 6:22]
Right.

[Speaker 2 - 6:23]
And ironically that's where I started. I was at Microsoft doing database design early in my career. Then my whole career has been data-driven applications. Mobile apps when the iPhone was hot, then I raised nine and a half million and built a SaaS product in the HR space, measuring employee engagement and performance. After we exited that, I started what I do now. Half education, half implementation.

[Speaker 1 - 6:43]
Okay.

[Speaker 2 - 6:44]
So if I think about your project: I don't know your data structures yet, but this is always how we start. What do you have, how do we centralize it, what platform, and then what are the use cases you want to build on top. A dashboard is one thing. But a workflow is, hey, resumes come in over here, and once twenty of them have landed, AI scans them all, normalizes them, stack ranks them, and hands that to the recruiter. That's a workflow.

[Speaker 1 - 7:06]
Okay, but hang on. Are you saying people are going to build their own database functionality? Because some of this is more complicated than a dashboard, isn't it? Payroll, for example. There's unique stuff in Australia, tax tables, awards, it goes to this field and that agency. Are you suggesting we buy modules and plug them in, or copy the architecture and build it ourselves? I'm not as techy as you two, so I'll ask the stupid questions.

[Speaker 2 - 7:28]
No, that's the right question. So, one of my clients is a payroll advisory firm in Sydney, they do everything but run payroll, they're consultants across a couple of thousand Australian clients. We built an app with them that lets workers submit pay slips and checks them against the rules. Here's the thing: that firm will always have a business, because the rules change constantly, and no AI keeps up with that by itself. We can build great things on top of their curated data. But I would never try to rebuild the curation. Same with anything that changes daily, like a scraping tool or a tax service. Don't rebuild those.

[Speaker 1 - 7:59]
Right, because that's my life, mate. I built a scraping tool once and the criteria change every day. I spend my life with everyone coming to my desk telling me it's broken. If we have fifty of those things, I'm jumping off a bridge. I don't want to be a tech company.

[Speaker 2 - 8:12]
[laughs] And I'm not recommending anybody rebuild all their SaaS apps. What I'm recommending is: whatever SaaS you choose, build the export so it syncs into a central database you own. If you're using two systems, they don't talk to each other and you can't use AI across them. Sync them into one place you own, that's phase one, and it's not expensive. Then over time you figure out, app A never changes, I don't actually need it. My CRM, I don't care about new features, all I need is to move people through stages and send some emails.

[Speaker 3 - 8:38]
Dave, that raises a real question though. If we're creating read-write applications, isn't the whole point of the API that it writes back to Atlas? If we pull data into a separate database and work off that, don't we end up with sync issues everywhere?

[Speaker 2 - 8:50]
So, if you're trying to sync two-way, that's a different story, and I don't know why you'd build into your own database and push back into Atlas. But if what you're building is automations, dashboards, views, analysis, it is so much easier on your own database. And if you ever cut the cord one day, you're done, it's all there, and by then you've already got views built on top of it. You become less and less dependent.

[Speaker 3 - 9:09]
Hmm.

[Speaker 2 - 9:10]
And honestly, it matters for your contract too. You don't own that Atlas database. If you stop paying, you've got to move it.

[Speaker 1 - 9:16]
That's a good point for the contract, actually. The data's ours, but what do we do to get it? All right, noted.

[Speaker 3 - 9:22]
Okay. And do you have real experience with APIs themselves? There's a decent chance the RecruitPro API is lame, it's locally built. We've got to weigh whether it's worth the effort given it's redundant in six months anyway.

[Speaker 2 - 9:33]
Yeah. All our development is API-driven, back end code, APIs, front end connects to the API. Standard architecture. I'm very comfortable there, and part of the first look would be an honest read on whether the RecruitPro API is worth building against or whether we wait for Atlas.

[Speaker 1 - 9:47]
Okay. Before we go further, can you tell us what sort of manpower you've got, and what services you're actually offering clients? Because what we need is to build capability on top of Atlas, well built, consistent, with a supplier who can help us on an ongoing basis. That's the capability we're after.

[Speaker 2 - 10:02]
Sure. We work with clients three ways. One is pure staffing. Someone says, I want an engineer working exclusively for me. We find them, we staff them in Vietnam, remote, and they sit inside our engineering team. That matters because a lone software engineer at a normal business is miserable, nobody to code review with. This way they're on your team but inside our engineering culture.

[Speaker 1 - 10:21]
So like typical outsourcing, someone who just looks after us. And it's developers, not network admin stuff?

[Speaker 2 - 10:27]
Just development, yeah. Plus specialists behind them, database people, one of my leads did years of data work at a big consultancy in the US. Model two, we call human tokens. You buy a block of work. Forty human tokens, two thousand US dollars. We take on a task, build this dashboard, and you get access to our tracker: time spent by the human, AI tokens spent, pull requests shipped. Completely transparent, tokenized work. That's the on-demand model. And model three is consulting, longer term, where I help with strategy and oversee the program.

[Speaker 3 - 10:56]
The human token model, that's essentially paying per hour?

[Speaker 2 - 10:59]
Pretty much, but leveraged. An expert hour paired with AI produces about four times the output, and you see exactly what shipped, not hours on a timesheet. We also do training. One of my Australian clients flew to Vietnam for five days, paired with an engineer, learned to manage pieces of her own product. Anyone can vibe-code something with Claude these days. To harden it into real software, you inevitably need an engineer. That's where the tokens come in.

[Speaker 3 - 11:22]
And setting up something like the dashboard we described, remote login, cloud-based, that we build apps and workflows on top of, that's in your wheelhouse?

[Speaker 2 - 11:30]
I think so. For me to say we can take something on, I need the use cases and a look at Atlas and what you're trying to do. Then we give you a simple quote, we think this is two packs of tokens, or we say honestly, that one's not in our wheelhouse. But movement of data, display of data, transformation of data, that's what we specialize in.

[Speaker 3 - 11:47]
And would you build it decoupled, Next.js or similar? Or given the Microsoft integrations, Outlook, calendars, would you steer toward building inside that Microsoft environment?

[Speaker 2 - 11:57]
Good question. Even Microsoft is fairly open these days with the right permissioning, it's just harder to set up. It comes down to how fast you want to move and your security posture. Deploy lean on something like Vercel and move fast, or run it through the more locked-down environment. That's a decision we'd look at properly, not something I'd call on this phone call.

[Speaker 3 - 12:14]
Okay. And AI security generally. If Claude or whatever model is taking our candidate data, processing it, bringing it back, where do you sit on that? I tend to be relaxed, it's all cloud anyway, but some people hate their data leaving the environment.

[Speaker 2 - 12:27]
So, both of the big AI companies now have enterprise contracts that make data protection legally binding. Once they put their name on that contract, the big accounting firms started rolling it out to hundreds of thousands of staff. I'm old enough that I built websites at the start of the internet, and people said nobody will ever put a credit card on a website, it's too dangerous. That ship sailed. There's no stopping this one either, and data privacy is the single biggest problem these vendors are working on. My biggest client is US healthcare, patient data, compliance everywhere, and we handle it, anonymization, the lot. It's manageable if you design for it.

[Speaker 3 - 12:59]
Yeah, fair.

[Speaker 1 - 13:00]
And commercials, mate. Living in Vietnam, can you access reasonably priced developers? Is it skill, price, or a bit of both? Because we're getting to the stage where everything's remote and honestly we like sitting with a bloke around the corner. So there's got to be a good reason.

[Speaker 2 - 13:14]
The obvious one is price. It's hands down cheaper than Australia, full stop. On quality, Vietnam invested heavily in engineering education years ago. One of my lead engineers went to university in Australia and came home, because the opportunity is at home now. The brain drain reversed. So you get strong engineers at a fraction of the cost, sitting inside a team that reviews each other's work.

[Speaker 1 - 13:34]
We're all trying to leave Australia now too, mate, don't worry. [laughs]

[Speaker 2 - 13:38]
[laughs] I run these retreats, actually, we call them infinite leverage. Founders come to Vietnam, we set up an apartment, they pair with engineers and go after it for five days. It's the fastest growing part of my business, this co-developing thing.

[Speaker 1 - 13:50]
If I said it hadn't crossed my mind a short time ago, I'd be lying.

[Speaker 2 - 13:54]
[laughs] There you go.

[Speaker 1 - 13:56]
All right, but here's my real frustration, Dave. Separate from the project. Inside the business right now there's so much low-hanging fruit. Every time someone produces something it's a different format, different structure. Our marketing girl is going part-time and she spends half her week doing LinkedIn posts by hand. I ran a thing the other day, go look at all our job adverts on the website and check the quality, go read the transcribed interviews and give the consultant feedback. There's so much there. But we don't have the expertise to get past the toy stage, and it all falls back on me. Marie, our GM, she's going to own this tech office going forward. Should we be looking at internal business systems as its own thing? Because that stuff shouldn't wait for December.

[Speaker 2 - 14:33]
No, it shouldn't, and the foundation is the same company database. I'll give you one of mine. One-on-ones. Everything gets recorded, summarized into a coaching framework, action items dropped into our chat tool, Friday it nudges people on progress, and before the next session it builds my prep including the person's personality profile. Fully automated. On the recruiting side, my days-to-hire went from forty-three to seventeen. My recruiter told me she spent forty hours per role scanning resumes. Now they drop in a folder, AI scans them, creates a normalized view exactly how she likes to read it, fifteen lines, and stack ranks. People say, but you might miss some. It's okay. I'd rather she spend the hours talking to people than reading resumes.

[Speaker 1 - 15:09]
See, I reckon I could save ten hours a week per consultant with a couple of those. CV prep, interview notes. We're trying to do them now and it's just clunky.

[Speaker 2 - 15:17]
Right, and that's your tribal knowledge. If you feed it into the workflow, AI can act on it. AI is PhD-level in almost everything, but if you prompt it like, act as a marketer, you get the average of average. If you give it your framework, your context, your voice, it's a different machine. For the internal stuff, I run a workshop I call the Four Offices of the Future. Revenue, talent, operations, innovation. We walk through it with you and a couple of key leaders, and the output is a ranked roadmap of all the repetitive, no-value work in people's heads, plus the hyper-personalization stuff you wish you could do. That would be the thing to run with Marie.

[Speaker 3 - 15:47]
And one more for the big picture, Dave. The nirvana for us is this. When we take a job vacancy, the team interviews the line manager, keeps the transcript on the job profile, pulls the annual report, HR policy, all of it. Same on the candidate side, interview transcripts, notes. So there's a mountain of qualitative data. This guy's a micromanager, this candidate works well FIFO but needs latitude. The nirvana is AI reading all of that and saying, here's the shortlist, and here's why each one fits this specific job, written up so we can send it to the client and the candidate. That's where recruitment is going.

[Speaker 2 - 16:19]
Yeah. And my little framework for that is: define the problem, then what data is needed to solve it, then what are the steps. When you do that, you realize the transcripts live in five different places, the job description over here, notes over there. So you organize it into a central structure and then the workflow can act. And to Gordon's point earlier, if you use a generic note-taker summary, it's garbage. But take the raw transcript, maybe two note-takers, have AI analyze and summarize exactly to your template, name, years, salary expectation, the three technologies you care about, present or not, fifteen lines. It normalizes into what you want to see. The technology is not the problem. The problem is the process, and the speed of AI exposes the flaws in the business, because most of it is tribal knowledge that was never documented.

[Speaker 1 - 16:59]
Well, that's the day we're doing next week, documenting the lot. All right, Dave, I can see the smugness, mate, you're going, come on, put it all in the database. [laughs]

[Speaker 2 - 17:07]
[laughs]

[Speaker 1 - 17:08]
So look, here's what I want to do. Mick and I will do the workflow day, look at the Atlas gaps, and get you a scope of works on the project side. And separately, get me something I can talk to Marie about for the business systems, because she's got this marketing problem now and I don't think it needs outsourcing, I think it needs automating.

[Speaker 3 - 17:24]
Yeah. So Dave, I imagine for the quote you just need our existing architecture and what we want done, and you'd advise from there?

[Speaker 2 - 17:31]
Exactly that. Existing architecture, core use cases, that's enough to get started. We'll inevitably have questions we want to dive into, but that's it.

[Speaker 1 - 17:38]
Good. Because project people come and go, mate. For the business, I want a consistent, reliable partner. That's based on trust, and you working with us over the coming months. That's what I feel like we can start on pretty much straight away.

[Speaker 2 - 17:50]
Sounds good. I'll look for the scope of works from you, and I'll send something over for Marie. We'll talk soon.

[Speaker 1 - 17:56]
Really appreciate the time, Dave. Great to meet you.

[Speaker 3 - 17:59]
Yeah, likewise. Talk soon.

[Speaker 2 - 18:01]
Thanks, guys. Bye-bye.

---

## Demo key (not part of the transcript)

| Role | Fictional | Real-call equivalent |
|---|---|---|
| Founder / owner (Speaker 1) | Gordon Blake, Ridgeline Recruitment, Brisbane | — |
| Tech consultant (Speaker 3) | Mick Torrens | — |
| Edge8 (Speaker 2) | Dave Hajdu | Dave Hajdu |
| GM taking over "tech office" | Marie | — |
| Referrer | Stefan | — |
| Legacy CRM/ATS | RecruitPro (remote desktop, unsupported) | — |
| New CRM | Atlas CRM (Microsoft stack) | — |
| Company shape | 18 seats, ~320 contractors, QLD/NSW, civil & mining | — |

Pre-seed for the demo CRM: company **Ridgeline Recruitment** (ridgelinerecruitment.com.au, Brisbane) at lifecycle stage `lead`, person **Gordon Blake** (gordon@ridgelinerecruitment.com.au, Founder) with lead status `connected`, plus a prior "intro email" interaction so the timeline looks lived-in.
