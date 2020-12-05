<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@firebase/firestore](./firestore.md) &gt; [/](./firestore_.md) &gt; [onSnapshotsInSync](./firestore_.onsnapshotsinsync_1.md)

## onSnapshotsInSync() function

Attaches a listener for a snapshots-in-sync event. The snapshots-in-sync event indicates that all listeners affected by a given change have fired, even if a single server-generated change affects multiple listeners.

NOTE: The snapshots-in-sync event only indicates that listeners are in sync with each other, but does not relate to whether those snapshots are in sync with the server. Use SnapshotMetadata in the individual listeners to determine if a snapshot is from the cache or the server.

<b>Signature:</b>

```typescript
export declare function onSnapshotsInSync(firestore: FirebaseFirestore, onSync: () => void): Unsubscribe;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  firestore | [FirebaseFirestore](./firestore_.firebasefirestore.md) | The instance of Firestore for synchronizing snapshots. |
|  onSync | () =&gt; void | A callback to be called every time all snapshot listeners are in sync with each other. |

<b>Returns:</b>

[Unsubscribe](./firestore_.unsubscribe.md)

An unsubscribe function that can be called to cancel the snapshot listener.
