'use strict';
// Read-only release inventory. Never prints download tokens or file URLs.
// Run with an authorized Firebase service identity: node scripts/audit-private-files.js PROJECT_ID BUCKET_NAME
const admin = require('firebase-admin');
const [projectId, storageBucket] = process.argv.slice(2);
if (!projectId || !storageBucket) throw Error('Provide explicit project ID and bucket name');
admin.initializeApp({ projectId, storageBucket });
async function main() {
  const db = admin.firestore();
  const root = 'artifacts/default-digitask-app';
  let exposedProductDocuments = 0;
  for (const query of [db.collection(root + '/products'), db.collectionGroup('myProducts')]) {
    const snapshot = await query.get();
    exposedProductDocuments += snapshot.docs.filter(doc => {
      const data = doc.data();
      return Array.isArray(data.fileUrls) && data.fileUrls.length > 0;
    }).length;
  }
  let privateFiles = 0;
  let filesWithDownloadTokens = 0;
  let missingOwnerMetadata = 0;
  for (const prefix of [root + '/product_files/', root + '/chat_attachments/', root + '/orders/',
    'payment_proofs/', 'dispute_evidence/', 'deliverables/', 'support-tickets/']) {
    const [files] = await admin.storage().bucket().getFiles({ prefix });
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      privateFiles++;
      if (metadata.metadata?.firebaseStorageDownloadTokens) filesWithDownloadTokens++;
      if (!metadata.metadata?.ownerId) missingOwnerMetadata++;
    }
  }
  console.log(JSON.stringify({ projectId, storageBucket, exposedProductDocuments, privateFiles,
    filesWithDownloadTokens, missingOwnerMetadata, changedFiles: 0 }, null, 2));
}
main().catch(error => { console.error('Read-only inventory failed:', error.code || 'unknown'); process.exitCode = 1; });
