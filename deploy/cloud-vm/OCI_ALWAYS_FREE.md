# Oracle Always Free checklist

Stay at **2 OCPU / 12 GB** on `VM.Standard.A1.Flex`. Always Free was reduced to that cap in 2026; larger shapes can be stopped.

## Create the VM

1. Sign in to https://cloud.oracle.com
2. Compute → Instances → Create instance
3. Image: Ubuntu 22.04 or 24.04 minimal (aarch64)
4. Shape: Ampere / VM.Standard.A1.Flex / 2 OCPU / 12 GB memory
5. Networking: existing VCN, assign a public IP for SSH only
6. SSH key: your public key
7. Boot volume: 200 GB if the picker allows it on Always Free

## Security list / NSG

Allow:

- TCP 22 from your IP (or a small admin CIDR)

Deny / do not add:

- 3011, 3012, 3333–3336, 3340, 3350, 3360

All operator and Worker traffic uses Cloudflare Tunnel.

## $1 budget alert

1. Billing & Cost Management → Budgets
2. Create budget on this compartment
3. Amount: `1` USD
4. Alert at 80% and 100%
5. Email: the operator address

Set the alert even when the plan is $0 so a mis-shaped instance cannot silently bill.

## Tunnel token

Zero Trust → Networks → Tunnels → the existing Chicago Shining tunnel → token. Put it in `deploy/cloud-vm/.env` as `CLOUDFLARED_TUNNEL_TOKEN`. Do not create a second named tunnel.

## After first boot

```bash
sudo bash /opt/sm-pipeline/deploy/cloud-vm/bootstrap-oracle.sh
```

If the repo is not on the VM yet, copy it or `git clone` then run the script from the checkout.

## Rollback to Windows

1. Start the numbered `LOC` services
2. Start Windows `cloudflared` (or `python deploy/cloud-vm/switch_tunnel_origin.py --service <name> --origin windows` for each hostname)
3. `docker compose --profile vm down` on the VM
