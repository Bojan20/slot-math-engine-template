// Standalone helper to generate canonical expected values for W236.
// Run from rust-sim crate root: `cargo run --example gen_expected_w236`
// (or just paste into a temp test and run with --nocapture).

use slot_sim::rng::{Mulberry32Backend, Pcg64Backend, RngBackend};

fn main() {
    println!("Mulberry32 split(state=0x5555_5555, nonce=0xAAAA_AAAA, after 1×next_u64):");
    {
        let mut base = Mulberry32Backend::new(0x5555_5555);
        let _ = base.next_u64();
        let mut s = base.split(0x0000_0000_AAAA_AAAA);
        for i in 0..3 {
            println!("  [{}] = 0x{:016x}", i, s.next_u64());
        }
    }
    println!("\nMulberry32 split(state=1, nonce=0, no advance):");
    {
        let base = Mulberry32Backend::new(0x0000_0001);
        let mut s = base.split(0);
        for i in 0..3 {
            println!("  [{}] = 0x{:016x}", i, s.next_u64());
        }
    }
    println!("\nPcg64 split(state=0x42, nonce=0x1111...):");
    {
        let parent = Pcg64Backend::new(0x42);
        let mut s = parent.split(0x1111_1111_1111_1111);
        for i in 0..3 {
            println!("  [{}] = 0x{:016x}", i, s.next_u64());
        }
    }
    println!("\nPcg64 split(state=0x42, nonce=0x2222...):");
    {
        let parent = Pcg64Backend::new(0x42);
        let mut s = parent.split(0x2222_2222_2222_2222);
        for i in 0..3 {
            println!("  [{}] = 0x{:016x}", i, s.next_u64());
        }
    }
    println!("\nPcg64 split(state=0xDEAD_BEEF_DEAD_BEEF, nonce=0xFFFF_0000_FFFF_0000):");
    {
        let parent = Pcg64Backend::new(0xDEAD_BEEF_DEAD_BEEF);
        let mut s = parent.split(0xFFFF_0000_FFFF_0000);
        for i in 0..3 {
            println!("  [{}] = 0x{:016x}", i, s.next_u64());
        }
    }
}
