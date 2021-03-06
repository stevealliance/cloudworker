addEventListener('fetch', event => {
    event.respondWith(verifyAndFetch(event.request))
  })

function fromHexStringToUint8Array(str) {
    var a = [];
    for (var i = 0, len = str.length; i < len; i+=2) {
      a.push(parseInt(str.substr(i,2),16));
    }
    return new Uint8Array(a);
}

async function verifyAndFetch(request) {
    const url = new URL(request.url)

    // We'll need some super-secret data to use as a symmetric key.
    // const encoder = new TextEncoder()
    const secretKeyData = byteStringToUint8Array("my secret symmetric key")
    const key = await crypto.subtle.importKey(
      "raw", secretKeyData,
      { name: "HMAC", hash: "SHA-256" },
      false, [ "verify" ]
    )

    // Extract the query parameters we need and run the HMAC algorithm on the
    // parts of the request we're authenticating: the path and the expiration
    // timestamp.
    const expiry = Number(url.searchParams.get("expiry"))
    const dataToAuthenticate = url.pathname + expiry

    // The received MAC is Base64-encoded, so we have to go to some trouble to
    // get it into a buffer type that crypto.subtle.verify() can read.
    const receivedMacBase64 = url.searchParams.get("mac")
    const receivedMac = fromHexStringToUint8Array(receivedMacBase64)

    // Use crypto.subtle.verify() to guard against timing attacks. Since HMACs use
    // symmetric keys, we could implement this by calling crypto.subtle.sign() and
    // then doing a string comparison -- this is insecure, as string comparisons
    // bail out on the first mismatch, which leaks information to potential
    // attackers.
    const verified = await crypto.subtle.verify(
      "HMAC", key,
      receivedMac,
      byteStringToUint8Array(dataToAuthenticate)
    )

    if (!verified) {
      const body = "Invalid MAC"
      return new Response(body, { status: 403 })
    }

    if (Date.now() > expiry) {
      const body = "URL expired"
      return new Response(body, { status: 403 })
    }

    // We've verified the MAC and expiration time; we're good to pass the request
    // through.
    return fetch(request)
}

// Convert a ByteString (a string whose code units are all in the range
// [0, 255]), to a Uint8Array. If you pass in a string with code units larger
// than 255, their values will overflow!
function byteStringToUint8Array(byteString) {
    const ui = new Uint8Array(byteString.length)
    for (let i = 0; i < byteString.length; ++i) {
      ui[i] = byteString.charCodeAt(i)
    }
    return ui
}