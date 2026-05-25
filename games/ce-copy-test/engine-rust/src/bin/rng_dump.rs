// Dumps the first N Pcg64 u64 outputs for the given seed. Used to build a
// golden file the TS PCG64 emulator validates against (bit-identical
// parity gate prerequisite).
//
// Usage: rng-dump --seed 0xCEC0C0FE --count 100

use clap::Parser;
use rand::SeedableRng;
use rand_pcg::Pcg64;

#[derive(Parser)]
struct Args {
    #[arg(long, default_value_t = 0xCEC0_C0FE)]
    seed: u64,
    #[arg(long, default_value_t = 100)]
    count: usize,
}

fn main() {
    let args = Args::parse();
    let mut rng = Pcg64::seed_from_u64(args.seed);
    for _ in 0..args.count {
        // rand_core RngCore::next_u64
        let v: u64 = rand::Rng::gen(&mut rng);
        println!("{}", v);
    }
}
