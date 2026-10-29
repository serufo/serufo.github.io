// ===== SPA Router =====
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('[data-page]');
const menuToggle = document.getElementById('menuToggle');
const navLinksContainer = document.getElementById('navLinks');
const yearEl = document.getElementById('year');

// Set current year
if (yearEl) yearEl.textContent = new Date().getFullYear();

function showPage(pageId) {
  // Hide all pages
  pages.forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageId || (link.getAttribute('href') === `#${pageId}`)) {
      link.classList.add('active');
    }
  });

  // Close mobile menu
  navLinksContainer?.classList.remove('open');
  menuToggle?.classList.remove('active');

  // Close dropdowns on mobile
  document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('open'));
}

// Handle hash changes and initial load
function handleRoute() {
  const hash = window.location.hash.slice(1) || 'home';
  showPage(hash);
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

// Click handlers for all data-page links
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    const page = link.dataset.page;
    if (page) {
      e.preventDefault();
      window.location.hash = page;
    }
  });
});

// Mobile menu toggle
menuToggle?.addEventListener('click', () => {
  navLinksContainer.classList.toggle('open');
  menuToggle.classList.toggle('active');
});

// Mobile dropdown toggle
document.querySelectorAll('.dropdown-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (window.innerWidth <= 1100) {
      e.preventDefault();
      e.stopPropagation();
      const dropdown = btn.closest('.dropdown');
      dropdown.classList.toggle('open');
    }
  });
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 1100 &&
      navLinksContainer?.classList.contains('open') &&
      !navLinksContainer.contains(e.target) &&
      !menuToggle.contains(e.target)) {
    navLinksContainer.classList.remove('open');
    menuToggle.classList.remove('active');
  }
});
