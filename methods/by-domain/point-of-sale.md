# Trade: point of sale (retail and restaurant tills)

> Generic profile. Seeded from trade knowledge; awaiting a first full target (uniCenta oPOS is the intended one, GPL). No proprietary content.

## Entities to expect
- **Product / item** — code/barcode, name, category, price (often several price lists), tax class, stock-tracked flag.
- **Category / department**, **Tax rate**, **Price list**.
- **Ticket / sale / order** — number, date, cashier, table (restaurant), lines, totals, payment(s), status (open/paid/void).
- **Ticket line** — product, quantity, unit price, discount, line total, tax.
- **Payment** — method (cash, card, ...), amount, change given.
- **Cashier / user / role**, **Cash drawer session** (open float, movements, Z report / close), **Customer** (optional), **Stock movement**.

## Rules to look for
- **Line and ticket totals** — line = qty x unit price - discount; ticket total, tax computed per rate, rounding.
- **Change / tender** — change = tendered - total; split payments.
- **Discounts** — per line and per ticket, percentage vs amount, order of application.
- **Void / return** — what a cancel does to stock and totals, permissions required.
- **Cash session close (Z report)** — expected vs counted, movements, numbering of sessions.
- **Numbering** — ticket numbers, per day/terminal reset.
- **Stock decrement** — when stock drops (on sale, on payment), negative stock allowed?

## Screens that usually exist
- Sale screen (product pad/grid + ticket + totals + tender)
- Product and category management, price lists
- Payment dialog, change display
- Cash session open/close (Z report)
- Reports: sales by product/category/period, cashier report
- Login / user switch

## First questions
- Where is the data (embedded database? its schema gives items, tickets, lines, payments)?
- How are totals, tax and change computed and rounded?
- What does a void/return do to stock and the ticket?
- How is a cash session closed and numbered?

## Technology notes
- Often Java (uniCenta, Chromis, Floreant) or .NET. Java: read the class files (bytecode is high level). .NET: read managed metadata without an engine. Embedded database (Derby, HSQLDB, SQLite, MySQL) is the best source of the data model.

## Migration notes
- Product catalogue, price lists and historical tickets are what a shop keeps. Map new fields to the original tables so sales history and stock carry across.

## Targets seen
- (none fully yet)
