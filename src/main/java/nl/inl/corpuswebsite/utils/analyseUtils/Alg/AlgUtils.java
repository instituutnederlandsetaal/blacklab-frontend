package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

/**
 * ClassName: AlgUtils
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the Utils used in "Alg" package.
 */
public class AlgUtils {
    /** Obtain the expected frequencies, assuming here that the lengths of the input arrays are the same. **/
    public static double[][] getFreqsExpected(int[] o11s, int[] o12s, int[] o21s, int[] o22s) {
        int[][] marginalFreqs = getFreqsMarginal(o11s, o12s, o21s, o22s);

        int[] o1xs = marginalFreqs[0];
        int[] o2xs = marginalFreqs[1];
        int[] ox1s = marginalFreqs[2];
        int[] ox2s = marginalFreqs[3];

        int length = o1xs.length;
        int[] oxxs = new int[length];
        for (int i = 0; i < length; i++) {
            oxxs[i] = o1xs[i] + o2xs[i];
        }

        double[][] expectedFreqs = new double[4][length];
        for (int i = 0; i < length; i++) {
            expectedFreqs[0][i] = safeDivide(o1xs[i] * ox1s[i], oxxs[i]);
            expectedFreqs[1][i] = safeDivide(o1xs[i] * ox2s[i], oxxs[i]);
            expectedFreqs[2][i] = safeDivide(o2xs[i] * ox1s[i], oxxs[i]);
            expectedFreqs[3][i] = safeDivide(o2xs[i] * ox2s[i], oxxs[i]);
        }

        return expectedFreqs;
    }

    /** Obtain the marginal frequencies, assuming here that the lengths of the input arrays are the same. **/
    public static int[][] getFreqsMarginal(int[] o11s, int[] o12s, int[] o21s, int[] o22s) {
        int length = o11s.length;
        int[] o1xs = new int[length];
        int[] o2xs = new int[length];
        int[] ox1s = new int[length];
        int[] ox2s = new int[length];

        for (int i = 0; i < length; i++) {
            o1xs[i] = o11s[i] + o12s[i];
            o2xs[i] = o21s[i] + o22s[i];
            ox1s[i] = o11s[i] + o21s[i];
            ox2s[i] = o12s[i] + o22s[i];
        }
        return new int[][]{o1xs, o2xs, ox1s, ox2s};
    }

    /** Safe division to avoid division by zero **/
    static double safeDivide(double numerator, double denominator) {
        if (Math.abs(denominator) < 1e-8) {
            return 0; // 避免除以0
        }
        return (double) numerator / denominator;
    }

    /** Safe log to avoid logging zero **/
    static double safeLog(double num) {
        if (Math.abs(num) > 1e-8) {
            return Math.log(num);
        } else {
            return 0;
        }
    }

    /** Safe log2 (base 2) to avoid logging zero **/
    static double safeLog2(double num) {
        if (Math.abs(num) > 1e-8) {
            return Math.log(num) / Math.log(2);
        } else {
            return 0;
        }
    }
}
