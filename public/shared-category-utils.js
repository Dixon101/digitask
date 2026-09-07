// Shared category utilities for Digitask platform
// This file provides consistent category definitions across all pages

// Default categories (fallback if Firestore fetch fails)
const DEFAULT_CATEGORIES = [
  { 
    value: 'graphics', 
    label: 'Graphics & Design', 
    icon: 'fas fa-paint-brush', 
    color: 'bg-purple-100 text-purple-600' 
  },
  { 
    value: 'web', 
    label: 'Web & App Development', 
    icon: 'fas fa-code', 
    color: 'bg-blue-100 text-blue-600' 
  },
  { 
    value: 'writing', 
    label: 'Writing & Copywriting', 
    icon: 'fas fa-pen-fancy', 
    color: 'bg-green-100 text-green-600' 
  },
  { 
    value: 'cv', 
    label: 'CV, Resume & Document Help', 
    icon: 'fas fa-file-alt', 
    color: 'bg-gray-100 text-gray-600' 
  },
  { 
    value: 'video', 
    label: 'Video & Audio Editing', 
    icon: 'fas fa-video', 
    color: 'bg-red-100 text-red-600' 
  },
  { 
    value: 'social', 
    label: 'Social Media Management', 
    icon: 'fas fa-hashtag', 
    color: 'bg-pink-100 text-pink-600' 
  },
  { 
    value: 'marketing', 
    label: 'Digital Marketing & SEO', 
    icon: 'fas fa-chart-line', 
    color: 'bg-yellow-100 text-yellow-600' 
  },
  { 
    value: 'va', 
    label: 'Virtual Assistance & Admin Support', 
    icon: 'fas fa-headset', 
    color: 'bg-indigo-100 text-indigo-600' 
  },
  { 
    value: 'academic', 
    label: 'Academic Support & Tutoring', 
    icon: 'fas fa-book-open', 
    color: 'bg-teal-100 text-teal-600' 
  },
  { 
    value: 'translation', 
    label: 'Translation & Transcription', 
    icon: 'fas fa-language', 
    color: 'bg-cyan-100 text-cyan-600' 
  },
  { 
    value: 'legal', 
    label: 'Legal & Business Documentation', 
    icon: 'fas fa-gavel', 
    color: 'bg-gray-200 text-gray-700' 
  },
  { 
    value: 'finance', 
    label: 'Financial & Tax Services', 
    icon: 'fas fa-calculator', 
    color: 'bg-orange-100 text-orange-600' 
  },
  { 
    value: 'shopping', 
    label: 'Personal Shopper & Import Help', 
    icon: 'fas fa-shopping-bag', 
    color: 'bg-rose-100 text-rose-600' 
  },
  { 
    value: 'travel', 
    label: 'Travel, Visa & Migration Support', 
    icon: 'fas fa-plane', 
    color: 'bg-emerald-100 text-emerald-600' 
  },
  { 
    value: 'coaching', 
    label: 'Coaching, Mentorship & Career Help', 
    icon: 'fas fa-lightbulb', 
    color: 'bg-violet-100 text-violet-600' 
  }
];

/**
 * Fetches job categories from Firestore
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Array>} Array of category objects
 */
async function fetchJobCategoriesFromFirestore(db) {
  try {
    console.log('Attempting to fetch job categories from Firestore...');
    
    // Import Firestore functions
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
    
    // Try to fetch from a dedicated categories collection
    const categoriesCollection = collection(db, 'artifacts', 'default-digitask-app', 'categories');
    const categoriesSnapshot = await getDocs(categoriesCollection);
    
    if (!categoriesSnapshot.empty) {
      const fetchedCategories = [];
      categoriesSnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedCategories.push({
          value: data.value || doc.id,
          label: data.label || data.name,
          icon: data.icon || '',
          color: data.color || ''
        });
      });
      
      console.log('Job categories fetched from Firestore:', fetchedCategories);
      return fetchedCategories;
    } else {
      console.log('No categories found in Firestore, using default categories');
      return DEFAULT_CATEGORIES;
    }
  } catch (error) {
    console.error('Error fetching job categories from Firestore:', error);
    console.log('Using default job categories due to error');
    return DEFAULT_CATEGORIES;
  }
}

/**
 * Renders category options in a select dropdown
 * @param {string} selectElementId - ID of the select element
 * @param {Array} categories - Array of category objects
 * @param {string} defaultOptionText - Text for default option
 */
function renderCategorySelectOptions(selectElementId, categories, defaultOptionText = 'Select a category') {
  const selectElement = document.getElementById(selectElementId);
  if (!selectElement) {
    console.error(`Select element with ID ${selectElementId} not found`);
    return;
  }
  
  // Clear existing options
  selectElement.innerHTML = '';
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = defaultOptionText;
  selectElement.appendChild(defaultOption);
  
  // Add category options
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.value;
    option.textContent = category.label;
    selectElement.appendChild(option);
  });
}

/**
 * Renders category options in a multi-select dropdown
 * @param {string} containerElementId - ID of the container element
 * @param {Array} categories - Array of category objects
 * @param {Array} selectedCategories - Array of selected category values
 * @param {Function} onChangeCallback - Callback function for change events
 */
function renderCategoryMultiSelectOptions(containerElementId, categories, selectedCategories = [], onChangeCallback) {
  console.log('renderCategoryMultiSelectOptions called with:', {containerElementId, categories, selectedCategories});
  
  // Get the container element
  const containerElement = document.getElementById(containerElementId);
  
  // Check if the container element exists
  if (!containerElement) {
    console.error(`Container element with ID ${containerElementId} not found`);
    return;
  }
  
  console.log('Container element found:', containerElement);
  
  // Clear existing options
  containerElement.innerHTML = '';
  
  // Add category options
  categories.forEach(category => {
    const isChecked = selectedCategories.includes(category.value);
    const item = document.createElement('label');
    item.className = 'multi-select-dropdown-item';
    item.innerHTML = `
      <input type="checkbox" value="${category.value}" ${isChecked ? 'checked' : ''}>
      <span>${category.label}</span>
    `;
    containerElement.appendChild(item);

    if (onChangeCallback) {
      item.querySelector('input[type="checkbox"]').addEventListener('change', onChangeCallback);
    }
  });
}

// Export functions for use in other modules
window.fetchJobCategoriesFromFirestore = fetchJobCategoriesFromFirestore;
window.renderCategorySelectOptions = renderCategorySelectOptions;
window.renderCategoryMultiSelectOptions = renderCategoryMultiSelectOptions;
window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
