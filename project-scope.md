# AI-Powered Ticket Management System 

# Problem   

We receive hundreds of support emails daily. Our agents manually read, classify, and respond to each ticket – which is slow and leads to impersonal, canned responses.  

 # Solution      
 
 Build a ticket management system that uses AI to automatically classify, respond to, and route support tickets - delivering faster, more personalized responses to students while freeing up agents for complex issues.   

# Features   

- Receive support emails and create tickets   
- Auto-generate human-friendly responses using a knowledge base   
- Ticket list with filtering and sorting   
- Ticket detail view   
- AI-powered ticket classification   
- AI summaries   
- AI-suggested replies   
- User management (admin only)   
- Dashboard to view and manage all tickets   

# Tickets

## Statuses

Each ticket has exactly one status:

- **New** – just arrived; the AI hasn't looked at it yet
- **Processing** – the AI is trying to resolve it from the knowledge base
- **Open** – needs an agent, or is still being worked on
- **Resolved** – a solution has been provided
- **Closed** – no further action needed

## Categories

Each ticket belongs to a single category:

- **General question**
- **Technical question**
- **Refund request**

# Users & Roles

- **Admin** – the system is deployed with one admin account. The admin manages users and can create additional agents.
- **Agent** – created by the admin; works on tickets.
