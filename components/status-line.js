// Status text under a group's buttons.
//
//   const setStatus = StatusLine(el);
//   setStatus('Syncing…');
//   setStatus('No code.', true); // error
//   setStatus('');               // hide
const StatusLine = (element) => (message, isError = false) => {
  element.hidden = !message;
  element.textContent = message || '';
  element.classList.toggle('is-error', isError);
};
