package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

import java.util.List;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.AdjustedFreqAlg.rosengrensKf;

/**
 * ClassName: DispersionAlg
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the Algorithm of Measure of Dispersion implementation. The algorithm here see "wordless": https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-3
 */
public class DispersionAlg {
    public static double averageLogarithmicDistance(List<Integer> dists, int tokensLen) {
        if (dists.isEmpty()) {
            return 0;
        }

        double sum = 0;
        for (int dist : dists) {
            sum += dist * Math.log10(dist);
        }

        return sum / tokensLen;
    }

    public static double averageReducedFrequency(List<Integer> dists, int tokensLen) {
        if (dists.isEmpty()) {
            return 0;
        }

        double v = (double) tokensLen / dists.size();

        double sum = 0;
        for (int dist : dists) {
            sum += Math.min(dist, v);
        }

        return sum / v;
    }

    public static double averageWaitingTime(List<Integer> dists, int tokensLen) {
        if (dists.isEmpty()) {
            return 0;
        }

        double sumOfSquares = 0.0;
        for (int dist : dists) {
            sumOfSquares += Math.pow(dist, 2);
        }

        return  0.5 * (1 + sumOfSquares / tokensLen);
    }

    public static double carrollsD2(double[] freqs) {
        double freqTotal = 0.0;
        double entropy = 0.0;

        // 计算总频率
        for (double freq : freqs) {
            freqTotal += freq;
        }

        if (freqTotal == 0) {
            return 0; //
        }

        // 计算信息熵（以e为底的对数）
        for (double freq : freqs) {
            if (freq > 0) {
                entropy += freq * Math.log(freq); // base is e
            }
        }

        entropy = Math.log(freqTotal) - entropy / freqTotal;
        double d2 = entropy / Math.log(freqs.length);
        return d2;
    }

    public static double griessDP(double[] freqs) {
        double freqTotal = 0;
        for (double freq : freqs) {
            freqTotal += freq;
        }

        if (freqTotal == 0) {
            return 0;
        }

        int numSections = freqs.length;
        double dp = 0;
        for (double freq : freqs) {
            dp += Math.abs(freq / freqTotal - 1.0 / numSections);
        }
        dp /= 2;

        return dp;
    }

    public static double griessDPNormalization(double[] freqs) {
        double freqTotal = 0;
        for (double freq : freqs) {
            freqTotal += freq;
        }

        if (freqTotal == 0) {
            return 0;
        }

        int numSections = freqs.length;
        double dp = 0;
        for (double freq : freqs) {
            dp += Math.abs(freq / freqTotal - 1.0 / numSections);
        }
        dp /= 2;

        dp /= (1 - 1.0 / numSections);

        return dp;
    }

    public static double juillandsD(double[] freqs) {
        double sum = 0;
        double sumOfSquares = 0;
        int count = freqs.length;

        for (double freq : freqs) {
            sum += freq;
            sumOfSquares += freq * freq;
        }

        if (sum == 0) {
            return 0;
        }

        double mean = sum / count;
        double variance = (sumOfSquares - sum * mean) / count;
        double stdDev = Math.sqrt(variance);
        double cv = stdDev / mean;
        double d = 1 - cv / Math.sqrt(count - 1);
        return Math.max(0, d);
    }

    public static double lynesD3(double[] freqs) {
        double freqTotal = 0;

        for (double freq : freqs) {
            freqTotal += freq;
        }

        if (freqTotal == 0) {
            return 0;
        }

        double chisq = ChiSquare(freqs);

        double d3 = 1 - chisq / (4 * freqTotal);

        return Math.max(0, d3);
    }

    public static double rosengrensS(double[] freqs) {
        double sumOfSqrtFreqs = 0;
        for (double freq : freqs) {
            sumOfSqrtFreqs += Math.sqrt(freq);
        }

        if (freqs.length == 0) {
            return 0;
        }

        double kf = rosengrensKf(freqs);

        double freqTotal = 0;
        for (double freq : freqs) {
            freqTotal += freq;
        }

        if (freqTotal == 0) {
            return 0;
        }

        double s = kf / freqTotal;

        return s;
    }

    public static double zhangsDistributionalConsistency(double[] freqs) {
        double freqTotal = 0;
        for (double freq : freqs) {
            freqTotal += freq;
        }

        if (freqTotal == 0) {
            return 0;
        }

        int numSections = freqs.length;

        double sumOfSqrtFreqsOverSections = 0;
        for (double freq : freqs) {
            sumOfSqrtFreqsOverSections += Math.sqrt(freq) / numSections;
        }

        double dc = Math.pow(sumOfSqrtFreqsOverSections, 2) / (freqTotal / numSections);

        return dc;
    }



    // chi-square test
    private static double ChiSquare(double...values) {
        int n = values.length;
        double[] O = new double[n];
        double[] E = new double[n];
        double[] D = new double[n];
        double[] OESQ = new double[n];
        double[] OESQE = new double[n];

        double oSum = 0;
        double OESQESum = 0;
        for (int i = 0; i < n; i++) {
            O[i] = values[i];
            oSum = oSum + values[i];
        }
        for (int i = 0; i < n; i++) {
            E[i] = oSum / n;
            D[i] = O[i] - (oSum / n);
            OESQ[i] = Math.pow((O[i] - (oSum / n)), 2);
            OESQE[i] = Math.pow((O[i] - (oSum / n)), 2) / (oSum / n);
            OESQESum = OESQESum + Math.pow((O[i] - (oSum / n)), 2) / (oSum / n);
        }
        return OESQESum;
    }
}
