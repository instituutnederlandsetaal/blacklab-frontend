package nl.inl.corpuswebsite.utils;

public class QueryException extends HttpException {
	private QueryException(Exception e) {
		super(e);
	}
	public QueryException(int code, String body) {
		super(code, body);
	}
	public QueryException(String body) {
		super(body);
	}
	public QueryException(int code) {
		super(code);
	}

	public static QueryException wrap(Exception e) {
		if (e instanceof QueryException) return (QueryException) e;
		else return new QueryException(e);
	}
}
