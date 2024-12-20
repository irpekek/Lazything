
# Lazything

Lazything is a program designed to search for public VPN services from public GitHub repositories. Below is a detailed guide on how to install and use Lazything.




## Installation

To use Lazything, you need to have Deno installed. If you don't have Deno, you can install it by running the following command:

```bash
  curl -fsSL https://deno.land/install.sh | sh
```

Once Deno is installed, proceed with the following steps:

```bash
  git clone https://github.com/irpekek/Lazything && cd Lazything
  chmod +x main.ts
```
## Usage
Once installed, you can use Lazything to search for VPN networks by executing the following command:

```bash
./main.ts foo.bar.baz
```

Replace foo.bar.baz with the server name you are searching for. The program will look for VPN networks that include this server name.

For more information about the usage and available options, you can run the program with the --help flag