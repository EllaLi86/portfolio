console.log('IT\'S ALIVE!');

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}
// // Step 2.1: Get an array of all nav links into a variable
// const navLinks = $$("nav a");

// // Step 2.2: Find the link to the current page
// let currentLink = navLinks.find(
//     (a) => a.host === location.host && a.pathname === location.pathname
// );

// // Add the 'current' class to the found link
// if (currentLink) {
//   // or if (currentLink !== undefined)
//   currentLink.classList.add('current');
// }

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'https://github.com/ftlaiLB9', title: 'GitHub' }
];

const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/"  // Local server
    : "/portfolio/"; // Change this to your actual GitHub repo name


let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let title = p.title;
  if (!url.startsWith('http')) {
        url = BASE_PATH + url;
    }
  // next step: create link and add it to nav
  nav.insertAdjacentHTML('beforeend', `<a href="${url}">${title}</a>`);
}

