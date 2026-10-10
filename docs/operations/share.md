# Access keys

Your backend is yours by default: `vizoalica env add` connects you with the admin key, and you can
do everything. To let someone else in without giving them that secret, give them an **access key**.

## Choose what they can do

| They can                                      | Role      |
| --------------------------------------------- | --------- |
| Read results only                             | `analyst` |
| Read results and manage projects and websites | `owner`   |

A key reaches everything on the backend, one project, or one website.

## Manage keys in the console

Open **Access keys** from the backend menu at the top, or from a website's page (**Manage access keys**, which
shows only the keys that reach that website). The page lists every key by name and role; key values are never
shown again after they are created.

| Action     | What it does                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------ |
| **Create** | Name, role, and reach. The key is shown once; the page then shows what the other person runs.    |
| **Rename** | Changes the name only.                                                                           |
| **Rotate** | New secret, same name, role, and reach. The old secret stops at once. The new key is shown once. |
| **Delete** | Stops the key at once, on every computer.                                                        |

The first row is the built-in **Admin key**. It cannot be deleted from the console, so deleting keys never locks you
out. To replace it, run `vizoalica rotate <name> admin`. Expiry dates are not supported yet.

**Nothing is deployed.** The backend accepts a key from the moment it is issued, and revoking it there stops it at
once, on every computer. Send the key through a password manager, not chat or email.

## What the other person does

They add your backend to their own console, with the role of the key. The key is asked for hidden, and kept in
`~/.config/vizoalica/environments.json`, readable only by them:

```sh
vizoalica env add shop --connect --url https://YOUR_BACKEND_ADDRESS --role analyst
vizoalica env check shop
vizoalica console
```

From a script, the key comes from standard input, so it is not in the command line or shell history:

```sh
read -rs KEY && printf '%s' "$KEY" | vizoalica env add shop --connect \
  --url https://YOUR_BACKEND_ADDRESS --role analyst --secret-stdin
```

A revoked key is reported by `vizoalica env check` as rejected, with a hint to ask for a new one.

## Advanced: keep the key in OneCLI

With [OneCLI](onecli.md) the key is never saved on the computer; Vizoalica keeps only the placeholder
`onecli-managed`. Create a Generic secret with host = the backend's host, header `Authorization`, format
`Bearer {value}` and the key as the value, attached only to the agent that will use it, then point the
environment at it:

```sh
onecli secrets create --project PROJECT --name "Vizoalica analyst key shop" --type generic \
  --host-pattern YOUR_BACKEND_HOST --header-name Authorization --value-format 'Bearer {value}' --file ./key.txt
vizoalica env add shop --connect --url https://YOUR_BACKEND_ADDRESS --role analyst \
  --secret-onecli --onecli-workspace WORKSPACE --onecli-agent AGENT --onecli-gateway 127.0.0.1:10255
```

What an owner or analyst key can see is reviewed in [Access keys review](../privacy/access-keys-review.md).
