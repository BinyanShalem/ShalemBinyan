# Private meeting photos

Meeting photos use the Firebase bucket `binyanshalem-28b1a.firebasestorage.app`. The browser downloads each private image through the authenticated Firebase Storage SDK, so the bucket needs the checked-in CORS policy in addition to the checked-in Storage and Firestore rules.

## One-time bucket setup

If Storage has never been opened for this Firebase project, first open **Firebase Console → Databases & Storage → Storage** and create the default bucket. Keep the production bucket name shown above.

Apply the CORS policy from the repository root with either current Google Cloud CLI:

```sh
gcloud storage buckets update gs://binyanshalem-28b1a.firebasestorage.app --cors-file=storage-cors.json
```

or gsutil:

```sh
gsutil cors set storage-cors.json gs://binyanshalem-28b1a.firebasestorage.app
```

## Firebase deployment

Deploy the Storage rules, Firestore rules, meeting-photo index, and the assistant’s photo-routing prompt together:

```sh
firebase deploy --only storage,firestore:rules,firestore:indexes,functions:adminAssistant
```

The first deploy may ask to enable the Firebase Rules permission that lets Storage rules verify the referenced meeting in Firestore. Accept that prompt; uploads fail closed without it. Each display image and thumbnail performs one meeting-existence check, and metadata creation performs one more. Those reads count toward Firestore quota and billing (45 checks for 15 photos).

The image files are never assigned persistent download URLs. Both the image objects and their Firestore metadata require the server-issued `admin` claim. The admin service worker also excludes Firebase Storage requests from its cache.

Uploads accept up to 20 photos at once but can be repeated without a per-meeting total. The browser optimizes every source into a private display JPEG and thumbnail before uploading, which keeps typical storage and download costs very small.
