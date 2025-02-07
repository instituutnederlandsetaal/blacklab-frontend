package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

import org.apache.commons.math3.special.Gamma;

import java.util.List;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.DispersionAlg.*;

/**
 * ClassName: AdjustedFreqAlg
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the Algorithm of Measure of Adjusted Frequency implementation. The algorithm here see "wordless": https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-3
 */
public class AdjustedFreqAlg {
    public static double carrollsUm(double[] freqs) {
        double freqTotal = 0;
        for (double freq : freqs) {
            freqTotal += freq;
        }

        double d2 = carrollsD2(freqs);

        double um = freqTotal * d2 + (1 - d2) * freqTotal / freqs.length;

        return um;
    }

    public static double engwallsFm(double[] freqs) {
        int nonZeroFreqCount = 0;
        double totalFreq = 0;

        for (double freq : freqs) {
            totalFreq += freq;
            if (freq != 0) {
                nonZeroFreqCount++;
            }
        }
        double fm = (double) totalFreq * nonZeroFreqCount / freqs.length;

        return fm;
    }

    public static double fald(List<Integer> dists, int tokensLen) {
        if (dists.isEmpty()) {
            return 0;
        }

        double sum = 0.0;

        for (double dist : dists) {
            if (dist > 0) {
                double ratio = dist / tokensLen;
                sum += ratio * Math.log(ratio);
            }
        }

        return Math.exp(-sum);
    }

    public static double farf(List<Integer> dists, int tokensLen) {
        return averageReducedFrequency(dists, tokensLen);
    }

    public static double fawt(List<Integer> dists, int tokensLen) {
        if (dists.isEmpty()) {
            return 0;
        }

        double sumOfSquares = 0.0;
        for (double dist : dists) {
            sumOfSquares += dist * dist;
        }
        return (tokensLen * tokensLen) / sumOfSquares;
    }

    public static double juillandsU(double[] freqs) {
        double d = juillandsD(freqs);
        double freqTotal = 0;
        for (double freq : freqs) {
            freqTotal += freq;
        }

        double u = d * freqTotal;

        return u;
    }

    public static double kromersUr(double[] freqs) {
        double sum = 0.0;
        for (double freq : freqs) {
            sum += Gamma.digamma(freq + 1 ) - Gamma.digamma(1);
        }
        return sum;
    }

    public static double rosengrensKf(double[] freqs) {
        double sumOfSqrtFreqs = 0;
        for (double freq : freqs) {
            sumOfSqrtFreqs += Math.sqrt(freq);
        }

        double kf = Math.pow(sumOfSqrtFreqs, 2) / freqs.length;

        return kf;
    }
}
