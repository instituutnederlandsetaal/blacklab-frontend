package nl.inl.corpuswebsite.utils.analyseUtils.Alg;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import org.apache.commons.math3.distribution.ChiSquaredDistribution;
import org.apache.commons.math3.distribution.NormalDistribution;
import org.apache.commons.math3.distribution.TDistribution;
import org.apache.commons.math3.util.FastMath;
import org.apache.commons.statistics.inference.FisherExactTest;

import java.util.*;

import static nl.inl.corpuswebsite.utils.analyseUtils.Alg.AlgUtils.*;

/**
 * ClassName: TestAlg
 * Package: nl.inl.corpuswebsite.utils.analyseUtils.Alg
 * Description: the algorithm implementation of Statistical Significance Test. The algorithm here see "wordless": https://github.com/BLKSerene/Wordless/blob/main/doc/doc.md#doc-12-4-4
 */
public class TestAlg {
    public static void FishersExactTest(JSONArray jsonArray) {
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");

            if(o11 == 0 && o12 == 0 && o21 == 0 && o22 == 0)
            {
                jsonObject.put("testAlg_p", "Compute Fail");
                jsonObject.put("testAlg_stat", "Compute Fail");
            } else {
                double pValue = FisherExactTest.withDefaults().test(new int[][]{{o11, o12}, {o21, o22}}).getPValue();
                jsonObject.put("testAlg_p", String.format("%.6f",pValue));
                jsonObject.put("testAlg_stat", "None");
            }
        }
    };

    public static void logLikelihoodRatioTest(JSONArray jsonArray, List<String> keywords) {
        // The algorithms here assume that apply_correction has not been applied.
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();
        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();
        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }
        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);
            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] expectedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = expectedFreqs[0];
            double[] e12s = expectedFreqs[1];
            double[] e21s = expectedFreqs[2];
            double[] e22s = expectedFreqs[3];

            double[] gs = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                double gs_11 = safeLog(safeDivide(o11s[i], e11s[i])) * o11s[i];
                double gs_12 = safeLog(safeDivide(o12s[i], e12s[i])) * o12s[i];
                double gs_21 = safeLog(safeDivide(o21s[i], e21s[i])) * o21s[i];
                double gs_22 = safeLog(safeDivide(o22s[i], e22s[i])) * o22s[i];

                gs[i] = 2 * (gs_11 + gs_12 + gs_21 + gs_22);
            }

            double[] pVals = new double[gs.length];
            ChiSquaredDistribution chiSquaredDistribution = new ChiSquaredDistribution(1);

            for (int i = 0; i < gs.length; i++) {
                pVals[i] = 1 - chiSquaredDistribution.cumulativeProbability(gs[i]);

                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("testAlg_p", String.format("%.6f",pVals[i]));
                originalObject.put("testAlg_stat", String.format("%.6f",gs[i]));
            }

        }
    };

    public static void pearsonsChiSquaredTest(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int key = jsonObject.getIntValue("key");
            jsonObjectIndexMap.put(key, jsonObject);

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] expectedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = expectedFreqs[0];
            double[] e12s = expectedFreqs[1];
            double[] e21s = expectedFreqs[2];
            double[] e22s = expectedFreqs[3];

            double[] chi2s = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                double chi2s_11 = safeDivide(Math.pow(o11s[i] - e11s[i], 2), e11s[i]);
                double chi2s_12 = safeDivide(Math.pow(o12s[i] - e12s[i], 2), e12s[i]);
                double chi2s_21 = safeDivide(Math.pow(o21s[i] - e21s[i], 2), e21s[i]);
                double chi2s_22 = safeDivide(Math.pow(o22s[i] - e22s[i], 2), e22s[i]);

                chi2s[i] = chi2s_11 + chi2s_12 + chi2s_21 + chi2s_22;
            }

            double[] pVals = new double[chi2s.length];
            ChiSquaredDistribution chiSquaredDistribution = new ChiSquaredDistribution(1);

            for (int i = 0; i < chi2s.length; i++) {
                pVals[i] = 1 - chiSquaredDistribution.cumulativeProbability(chi2s[i]);
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("testAlg_p", String.format("%.6f",pVals[i]));
                originalObject.put("testAlg_stat", String.format("%.6f",chi2s[i]));
            }
        }
    }

    public static void studentsTTest1Sample(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> oxxsByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            oxxsByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int oxx = o11 + o12 + o21 + o22;
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);

            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                oxxsByKeyword.get(keyword).add(oxx);
                keysByKeyword.get(keyword).add(key);
            }
        }

        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] oxxs = oxxsByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] expectedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = expectedFreqs[0];

            double[] tStats = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                tStats[i] = safeDivide(o11s[i] - e11s[i], Math.sqrt(o11s[i] * (1 - safeDivide(o11s[i], oxxs[i]))));
            }

            double[] pVals = new double[tStats.length];

            for (int i = 0; i < tStats.length; i++) {
                // here we use two side mode
                if (oxxs[i] > 1) {
                    TDistribution tDist = new TDistribution(oxxs[i] - 1);
                    pVals[i] = 2 * (1 - tDist.cumulativeProbability(Math.abs(tStats[i])));
                } else {
                    pVals[i] = 1;
                }
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("testAlg_p", String.format("%.6f",pVals[i]));
                originalObject.put("testAlg_stat", String.format("%.6f",tStats[i]));
            }
        }
    }

    public static void ZScore(JSONArray jsonArray, List<String> keywords) {
        Map<String, List<Integer>> o11sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o12sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o21sByKeyword = new HashMap<>();
        Map<String, List<Integer>> o22sByKeyword = new HashMap<>();
        Map<String, List<Integer>> oxxsByKeyword = new HashMap<>();
        Map<String, List<Integer>> keysByKeyword = new HashMap<>();

        Map<Integer, JSONObject> jsonObjectIndexMap = new HashMap<>();

        for (String keyword : keywords) {
            o11sByKeyword.put(keyword, new ArrayList<>());
            o12sByKeyword.put(keyword, new ArrayList<>());
            o21sByKeyword.put(keyword, new ArrayList<>());
            o22sByKeyword.put(keyword, new ArrayList<>());
            oxxsByKeyword.put(keyword, new ArrayList<>());
            keysByKeyword.put(keyword, new ArrayList<>());
        }

        for (int i = 0; i < jsonArray.size(); i++) {
            JSONObject jsonObject = jsonArray.getJSONObject(i);
            String keyword = jsonObject.getString("keyword");
            int o11 = jsonObject.getIntValue("o11");
            int o12 = jsonObject.getIntValue("o12");
            int o21 = jsonObject.getIntValue("o21");
            int o22 = jsonObject.getIntValue("o22");
            int oxx = o11 + o12 + o21 + o22;
            int key = jsonObject.getIntValue("key");

            jsonObjectIndexMap.put(key, jsonObject);
            if (keywords.contains(keyword)) {
                o11sByKeyword.get(keyword).add(o11);
                o12sByKeyword.get(keyword).add(o12);
                o21sByKeyword.get(keyword).add(o21);
                o22sByKeyword.get(keyword).add(o22);
                oxxsByKeyword.get(keyword).add(oxx);
                keysByKeyword.get(keyword).add(key);
            }
        }

        // 遍历o11s, o12s, o21s, o22s
        for(String keyword: keywords)
        {
            int[] o11s = o11sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o12s = o12sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o21s = o21sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] o22s = o22sByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] oxxs = oxxsByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();
            int[] keys = keysByKeyword.get(keyword).stream().mapToInt(Integer::intValue).toArray();

            double[][] expectedFreqs = getFreqsExpected(o11s, o12s, o21s, o22s);

            double[] e11s = expectedFreqs[0];

            double[] zScores = new double[o11s.length];

            for (int i = 0; i < o11s.length; i++) {
                zScores[i] = safeDivide(o11s[i] - e11s[i], Math.sqrt(e11s[i] * (1 - safeDivide(e11s[i], oxxs[i]))));
            }

            double[] pVals = new double[zScores.length];
            NormalDistribution normalDist = new NormalDistribution();

            for (int i = 0; i < zScores.length; i++) {
                //here we use two-tailed mode
                pVals[i] = 2 * normalDist.cumulativeProbability(-FastMath.abs(zScores[i]));
                JSONObject originalObject = jsonObjectIndexMap.get(keys[i]);
                originalObject.put("testAlg_p", String.format("%.6f",pVals[i]));
                originalObject.put("testAlg_stat", String.format("%.6f",zScores[i]));
            }
        }
    }
}
