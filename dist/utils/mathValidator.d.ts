/**
 * MATH VALIDATOR UTILITY
 *
 * Validira matematičku konzistentnost pre simulacije.
 * Hvata greške rano - pre nego što potrošiš sate na simulaciju.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    info: string[];
}
export declare function validateMath(): ValidationResult;
export declare function printValidationReport(result: ValidationResult): void;
export declare function runValidation(): boolean;
//# sourceMappingURL=mathValidator.d.ts.map