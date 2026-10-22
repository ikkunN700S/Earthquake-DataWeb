document.addEventListener('DOMContentLoaded', () => {
    const mobileToggle = document.getElementById('mobile-search-toggle');
    const searchContainer = document.getElementById('search-container');
    const mobileIcon = document.getElementById('mobile-search-icon');

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            searchContainer.classList.toggle('hidden');
            if (searchContainer.classList.contains('hidden')) {
                mobileIcon.style.transform = 'rotate(0deg)';
            } else {
                mobileIcon.style.transform = 'rotate(180deg)'; // アイコンを上向きに回転
            }
        });
    }
});

document.getElementById('current-year').textContent = new Date().getFullYear();