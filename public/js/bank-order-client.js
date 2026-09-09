window.bankOrderCall = async function(name, data, user) {
  if (!['createBankOrder', 'approveBankOrder', 'downloadBankPurchase', 'manageBankPayout', 'manageBankDispute'].includes(name) || !user) throw Error('Sign in to continue.');
  const response = await fetch('https://europe-west1-digitask001.cloudfunctions.net/' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify({ data })
  });
  const body = await response.json();
  if (!response.ok || body.error) throw Error(body.error?.message || 'Request failed.');
  return body.result;
};
