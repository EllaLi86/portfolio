console.log('IT\'S ALIVE!');

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}
// Step 2.1: Get an array of all nav links into a variable
const navLinks = $$("nav a");

// Step 2.2: Find the link to the current page
let currentLink = navLinks.find(
    (a) => a.host === location.host && a.pathname === location.pathname
);

// Add the 'current' class to the found link
if (currentLink) {
  // or if (currentLink !== undefined)
  currentLink.classList.add('current');
}
